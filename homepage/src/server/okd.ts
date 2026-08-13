import { z } from 'zod';
import type { Cluster, Host, PlatformOperator, Severity, SourceMetadata, Workload } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock, type NormalizedSource } from './normalization.js';

export const OKD_CLUSTER_ID = 'okd';
export const OKD_POLL_INTERVAL_MS = 15_000;
export const OKD_REQUEST_TIMEOUT_MS = 3_000;

const OKD_CPU_MODELS: Readonly<Record<string, string>> = {
  'okd-cp-01': 'AMD Ryzen 5 PRO 5650GE · 6C/12T',
  'okd-cp-02': 'AMD Ryzen 5 PRO 5650GE · 6C/12T',
  'okd-cp-03': 'AMD Ryzen 5 PRO 5650GE · 6C/12T',
};

const ConditionSchema = z.object({ type: z.string(), status: z.string() });
const NodeListSchema = z.object({ items: z.array(z.object({
  metadata: z.object({ name: z.string().min(1) }),
  status: z.object({ conditions: z.array(ConditionSchema), capacity: z.record(z.string(), z.string()).optional() }),
})) });
const WorkloadListSchema = z.object({ items: z.array(z.object({
  metadata: z.object({ name: z.string().min(1), namespace: z.string().min(1) }),
  spec: z.object({ replicas: z.number().int().nonnegative().optional() }).optional(),
  status: z.object({ readyReplicas: z.number().int().nonnegative().optional(), currentNumberScheduled: z.number().int().nonnegative().optional(), desiredNumberScheduled: z.number().int().nonnegative().optional() }).optional(),
})) });
const NodeMetricsSchema = z.object({ items: z.array(z.object({
  metadata: z.object({ name: z.string().min(1) }),
  usage: z.object({ cpu: z.string().min(1), memory: z.string().min(1) }),
})) });
const OperatorListSchema = z.object({ items: z.array(z.object({
  metadata: z.object({ name: z.string().min(1) }),
  status: z.object({
    conditions: z.array(ConditionSchema),
    versions: z.array(z.object({ name: z.string(), version: z.string().min(1) })).optional(),
  }),
})) });

type RawSnapshot = {
  nodes: z.infer<typeof NodeListSchema>;
  nodeMetrics: z.infer<typeof NodeMetricsSchema>;
  deployments: z.infer<typeof WorkloadListSchema>;
  statefulSets: z.infer<typeof WorkloadListSchema>;
  daemonSets: z.infer<typeof WorkloadListSchema>;
  operators: z.infer<typeof OperatorListSchema>;
};

export interface OkdReadClient {
  listNodes(): Promise<unknown>;
  listNodeMetrics(): Promise<unknown>;
  listDeployments(): Promise<unknown>;
  listStatefulSets(): Promise<unknown>;
  listDaemonSets(): Promise<unknown>;
  listClusterOperators(): Promise<unknown>;
}

export interface OkdSnapshot {
  cluster: Cluster;
  hosts: Host[];
  workloads: Workload[];
  platformOperators: PlatformOperator[];
}

const rank: Record<Severity, number> = { OK: 0, INFO: 1, WARN: 2, CRIT: 3 };
function maxSeverity(...values: Severity[]): Severity {
  return values.reduce<Severity>((highest, value) => rank[value] > rank[highest] ? value : highest, 'OK');
}

export function parseKubernetesQuantity(value: string | undefined, kind: 'cpu' | 'memory'): number | null {
  if (!value) return null;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)(Ki|Mi|Gi|Ti|K|M|G|T|n|u|m)?$/);
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  const unit = match[2] ?? '';
  if (kind === 'cpu') return unit === 'n' ? numeric / 1e9 : unit === 'u' ? numeric / 1e6 : unit === 'm' ? numeric / 1e3 : unit === '' ? numeric : null;
  const multiplier: Record<string, number> = { '': 1, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };
  return multiplier[unit] === undefined ? null : numeric * multiplier[unit];
}

export function normalizeOkdNodeName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '').replace(/\.okd\.lab\.seandre\.dev$/, '');
}

export function normalizeOkdServer(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.hostname.toLowerCase().replace(/\.$/, '') !== 'api.okd.lab.seandre.dev' || url.port !== '6443' || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username || url.password) {
    throw new Error('OKD API server must be the approved strict-TLS endpoint.');
  }
  return 'https://api.okd.lab.seandre.dev:6443';
}

function condition(conditions: Array<{ type: string; status: string }>, type: string) {
  return conditions.some((item) => item.type === type && item.status === 'True');
}

function metadataFor(base: SourceMetadata, severity: Severity, message?: string): SourceMetadata {
  const combined = maxSeverity(base.severity, severity);
  return { ...base, severity: combined, ...(message ? { message } : base.message ? { message: base.message } : {}) };
}

function componentMetadata(base: SourceMetadata, severity: Severity, message?: string): SourceMetadata {
  return { ...base, severity, ...(message ? { message } : base.message ? { message: base.message } : {}) };
}

function emptyHostFields() {
  return {
    diskUsedBytes: null, diskTotalBytes: null, diskIoPercent: null, cpuModel: null, cpuCorePercentages: null,
    loadAverage: null, cpuClockMhz: null, powerWatts: null, swapUsedBytes: null, swapTotalBytes: null,
    uptimeSeconds: null, runningVmCount: null, stoppedVmCount: null, runningContainerCount: null,
    stoppedContainerCount: null, temperatureCelsius: null, networkIngressBitsPerSecond: null,
    networkEgressBitsPerSecond: null, networkTotalBytes: null,
  };
}

function workloadRecords(kind: string, list: z.infer<typeof WorkloadListSchema>, base: SourceMetadata): Workload[] {
  return list.items.map((item) => {
    const desired = item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 1;
    const ready = item.status?.readyReplicas ?? item.status?.currentNumberScheduled ?? 0;
    const healthy = ready >= desired;
    return {
      id: `${OKD_CLUSTER_ID}:${kind}:${item.metadata.namespace}:${item.metadata.name}`,
      name: item.metadata.name,
      clusterId: OKD_CLUSTER_ID,
      namespace: item.metadata.namespace,
      readyReplicas: ready,
      desiredReplicas: desired,
      href: null,
      metadata: componentMetadata(base, healthy ? 'OK' : 'WARN', healthy ? undefined : 'Workload is not fully ready.'),
    };
  });
}

function operatorRecords(list: z.infer<typeof OperatorListSchema>, base: SourceMetadata): PlatformOperator[] {
  return list.items.map((item) => {
    const available = condition(item.status.conditions, 'Available');
    const progressing = condition(item.status.conditions, 'Progressing');
    const degraded = condition(item.status.conditions, 'Degraded');
    const severity: Severity = degraded ? 'CRIT' : !available ? 'WARN' : progressing ? 'INFO' : 'OK';
    const message = degraded ? 'Operator reports a degraded condition.' : !available ? 'Operator is not available.' : progressing ? 'Operator is progressing.' : undefined;
    return {
      id: `${OKD_CLUSTER_ID}:operator:${item.metadata.name}`,
      clusterId: OKD_CLUSTER_ID,
      name: item.metadata.name,
      version: item.status.versions?.find((version) => version.name === 'operator')?.version ?? item.status.versions?.[0]?.version ?? null,
      available,
      progressing,
      degraded,
      metadata: componentMetadata(base, severity, message),
    };
  });
}

function configuredSnapshot(source: NormalizedSource<RawSnapshot>): OkdSnapshot {
  const sourceMetadata: SourceMetadata = source.value ? {
    ...source.metadata,
    ...(source.circuit === 'HALF_OPEN' ? { freshness: 'STALE' as const, severity: maxSeverity(source.metadata.severity, 'WARN'), message: 'Source recovery is awaiting a second successful sample.' } : {}),
  } : { ...source.metadata, severity: 'WARN', message: 'No successful OKD API sample is available.' };
  if (!source.value) {
    return {
      hosts: [], workloads: [], platformOperators: [],
      cluster: { id: OKD_CLUSTER_ID, name: 'OKD', platform: 'OKD', nodeCount: null, readyNodeCount: null, workloadCount: null, cpuCapacityCores: null, cpuUsedCores: null, memoryCapacityBytes: null, memoryUsedBytes: null, metadata: sourceMetadata },
    };
  }

  const metrics = new Map(source.value.nodeMetrics.items.map((item) => [normalizeOkdNodeName(item.metadata.name), item]));
  const hosts: Host[] = source.value.nodes.items.map((node) => {
    const name = normalizeOkdNodeName(node.metadata.name);
    const usage = metrics.get(name);
    const ready = condition(node.status.conditions, 'Ready');
    const cpuCapacity = parseKubernetesQuantity(node.status.capacity?.cpu, 'cpu');
    const memoryTotal = parseKubernetesQuantity(node.status.capacity?.memory, 'memory');
    const cpuUsed = parseKubernetesQuantity(usage?.usage.cpu, 'cpu');
    const memoryUsed = parseKubernetesQuantity(usage?.usage.memory, 'memory');
    return {
      id: `${OKD_CLUSTER_ID}:node:${name}`, name, kind: 'OKD_NODE',
      cpuPercent: cpuCapacity && cpuUsed !== null ? Math.min(100, Number((cpuUsed / cpuCapacity * 100).toFixed(1))) : null,
      memoryPercent: memoryTotal && memoryUsed !== null ? Math.min(100, Number((memoryUsed / memoryTotal * 100).toFixed(1))) : null,
      memoryUsedBytes: memoryUsed, memoryTotalBytes: memoryTotal, ...emptyHostFields(),
      cpuModel: OKD_CPU_MODELS[name] ?? null,
      metadata: componentMetadata(sourceMetadata, ready ? 'OK' : 'CRIT', ready ? undefined : 'Node is not Ready.'),
    };
  });
  const workloads = [
    ...workloadRecords('deployment', source.value.deployments, sourceMetadata),
    ...workloadRecords('statefulset', source.value.statefulSets, sourceMetadata),
    ...workloadRecords('daemonset', source.value.daemonSets, sourceMetadata),
  ];
  const platformOperators = operatorRecords(source.value.operators, sourceMetadata);
  const sum = (values: Array<number | null>) => values.some((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
  const componentSeverity = maxSeverity(
    ...hosts.map((host) => host.metadata.severity),
    ...workloads.map((workload) => workload.metadata.severity),
    ...platformOperators.map((operator) => operator.metadata.severity),
  );
  return {
    hosts, workloads, platformOperators,
    cluster: {
      id: OKD_CLUSTER_ID, name: 'OKD', platform: 'OKD', nodeCount: hosts.length,
      readyNodeCount: hosts.filter((host) => host.metadata.severity !== 'CRIT').length,
      workloadCount: workloads.length,
      cpuCapacityCores: sum(source.value.nodes.items.map((node) => parseKubernetesQuantity(node.status.capacity?.cpu, 'cpu'))),
      cpuUsedCores: sum(source.value.nodeMetrics.items.map((node) => parseKubernetesQuantity(node.usage.cpu, 'cpu'))),
      memoryCapacityBytes: sum(source.value.nodes.items.map((node) => parseKubernetesQuantity(node.status.capacity?.memory, 'memory'))),
      memoryUsedBytes: sum(source.value.nodeMetrics.items.map((node) => parseKubernetesQuantity(node.usage.memory, 'memory'))),
      metadata: metadataFor(sourceMetadata, componentSeverity),
    },
  };
}

export class OkdAdapter {
  private readonly normalizer: SourceNormalizer<RawSnapshot>;
  private lastAttemptMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly client: OkdReadClient, private readonly clock: Clock = { now: () => new Date() }, private readonly timeoutMs = OKD_REQUEST_TIMEOUT_MS) {
    this.normalizer = new SourceNormalizer<RawSnapshot>({ source: 'okd-api', staleAfterMs: 30_000, failureThreshold: 2, successThreshold: 2, circuitCooldownMs: OKD_POLL_INTERVAL_MS, clock });
  }

  async read(): Promise<OkdSnapshot> {
    const nowMs = this.clock.now().getTime();
    if (nowMs - this.lastAttemptMs >= OKD_POLL_INTERVAL_MS && this.normalizer.canAttempt()) {
      this.lastAttemptMs = nowMs;
      try {
        const [nodes, nodeMetrics, deployments, statefulSets, daemonSets, operators] = await withTimeout(Promise.all([
          this.client.listNodes(), this.client.listNodeMetrics(), this.client.listDeployments(), this.client.listStatefulSets(), this.client.listDaemonSets(), this.client.listClusterOperators(),
        ]), this.timeoutMs);
        this.normalizer.recordSuccess({
          nodes: NodeListSchema.parse(nodes), nodeMetrics: NodeMetricsSchema.parse(nodeMetrics), deployments: WorkloadListSchema.parse(deployments),
          statefulSets: WorkloadListSchema.parse(statefulSets), daemonSets: WorkloadListSchema.parse(daemonSets), operators: OperatorListSchema.parse(operators),
        });
      } catch {
        this.normalizer.recordFailure();
      }
    }
    return configuredSnapshot(this.normalizer.snapshot());
  }
}
