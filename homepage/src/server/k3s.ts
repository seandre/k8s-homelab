import { z } from 'zod';
import type { Cluster, Host, Workload } from '../shared/contracts.js';
import { SourceNormalizer, type Clock } from './normalization.js';

const NodeListSchema = z.object({ items: z.array(z.object({ metadata: z.object({ name: z.string().min(1) }), status: z.object({ conditions: z.array(z.object({ type: z.string(), status: z.string() })), capacity: z.record(z.string(), z.string()).optional() }) })) });
const WorkloadListSchema = z.object({ items: z.array(z.object({ metadata: z.object({ name: z.string().min(1), namespace: z.string().min(1) }), spec: z.object({ replicas: z.number().int().nonnegative().optional() }).optional(), status: z.object({ readyReplicas: z.number().int().nonnegative().optional(), currentNumberScheduled: z.number().int().nonnegative().optional(), desiredNumberScheduled: z.number().int().nonnegative().optional() }).optional() })) });
const NodeMetricsSchema = z.object({ items: z.array(z.object({ metadata: z.object({ name: z.string().min(1) }), usage: z.object({ cpu: z.string().min(1), memory: z.string().min(1) }) })) });

export interface K3sReadClient {
  listNodes(): Promise<unknown>;
  listDeployments(): Promise<unknown>;
  listStatefulSets(): Promise<unknown>;
  listDaemonSets(): Promise<unknown>;
  listNodeMetrics?(): Promise<unknown>;
}

export interface K3sSnapshot { cluster: Cluster; hosts: Host[]; workloads: Workload[]; }

type RawSnapshot = { nodes: z.infer<typeof NodeListSchema>; deployments: z.infer<typeof WorkloadListSchema>; statefulSets: z.infer<typeof WorkloadListSchema>; daemonSets: z.infer<typeof WorkloadListSchema>; nodeMetrics?: z.infer<typeof NodeMetricsSchema> };

function nodeReady(conditions: Array<{ type: string; status: string }>) { return conditions.some((condition) => condition.type === 'Ready' && condition.status === 'True'); }
function quantity(value: string | undefined, kind: 'cpu' | 'memory'): number | null {
  if (!value) return null;
  const match = value.match(/^([0-9.]+)(Ki|Mi|Gi|Ti|K|M|G|n|u|m)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2] ?? '';
  if (kind === 'cpu') return unit === 'n' ? number / 1_000_000_000 : unit === 'u' ? number / 1_000_000 : unit === 'm' ? number / 1_000 : unit === '' ? number : null;
  const multiplier: Record<string, number> = { '': 1, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, K: 1_000, M: 1_000 ** 2, G: 1_000 ** 3 };
  return multiplier[unit] === undefined ? null : number * multiplier[unit];
}

function nodeHost(node: z.infer<typeof NodeListSchema>['items'][number], metrics: z.infer<typeof NodeMetricsSchema>['items'][number] | undefined, metadata: Host['metadata']): Host {
  const ready = nodeReady(node.status.conditions);
  const cpuCapacity = quantity(node.status.capacity?.cpu, 'cpu');
  const memoryTotal = quantity(node.status.capacity?.memory, 'memory');
  const cpuUsed = quantity(metrics?.usage.cpu, 'cpu');
  const memoryUsed = quantity(metrics?.usage.memory, 'memory');
  return { id: node.metadata.name, name: node.metadata.name, kind: 'K3S_NODE', cpuPercent: cpuCapacity && cpuUsed !== null ? Math.min(100, Math.round(cpuUsed / cpuCapacity * 100)) : null, memoryPercent: memoryTotal && memoryUsed !== null ? Math.min(100, Math.round(memoryUsed / memoryTotal * 100)) : null, memoryUsedBytes: memoryUsed, memoryTotalBytes: memoryTotal, diskUsedBytes: null, diskTotalBytes: null, diskIoPercent: null, cpuModel: null, cpuCorePercentages: null, loadAverage: null, cpuClockMhz: null, powerWatts: null, swapUsedBytes: null, swapTotalBytes: null, uptimeSeconds: null, runningVmCount: null, stoppedVmCount: null, runningContainerCount: null, stoppedContainerCount: null, temperatureCelsius: null, networkIngressBitsPerSecond: null, networkEgressBitsPerSecond: null, metadata: { ...metadata, severity: ready ? 'OK' : 'WARN', message: ready ? undefined : 'Node is not Ready.' } };
}
function workloadRecords(kind: string, list: z.infer<typeof WorkloadListSchema>, metadata: Workload['metadata']): Workload[] {
  return list.items.map((item) => {
    const desired = item.spec?.replicas ?? item.status?.desiredNumberScheduled ?? 1;
    const ready = item.status?.readyReplicas ?? item.status?.currentNumberScheduled ?? 0;
    const healthy = ready >= desired;
    return { id: `${kind}:${item.metadata.namespace}:${item.metadata.name}`, name: item.metadata.name, clusterId: 'k3s', namespace: item.metadata.namespace, readyReplicas: ready, desiredReplicas: desired, href: null, metadata: { ...metadata, severity: healthy ? 'OK' : 'WARN', message: healthy ? undefined : 'Workload is not fully ready.' } };
  });
}

export class K3sAdapter {
  private readonly normalizer: SourceNormalizer<RawSnapshot>;
  constructor(private readonly client: K3sReadClient, clock?: Clock) {
    this.normalizer = new SourceNormalizer<RawSnapshot>({ source: 'k3s-api', staleAfterMs: 30_000, ...(clock ? { clock } : {}) });
  }

  async read(): Promise<K3sSnapshot | null> {
    if (this.normalizer.canAttempt()) {
      try {
        const [nodes, deployments, statefulSets, daemonSets, nodeMetrics] = await Promise.all([this.client.listNodes(), this.client.listDeployments(), this.client.listStatefulSets(), this.client.listDaemonSets(), this.client.listNodeMetrics?.()]);
        this.normalizer.recordSuccess({ nodes: NodeListSchema.parse(nodes), deployments: WorkloadListSchema.parse(deployments), statefulSets: WorkloadListSchema.parse(statefulSets), daemonSets: WorkloadListSchema.parse(daemonSets), ...(nodeMetrics ? { nodeMetrics: NodeMetricsSchema.parse(nodeMetrics) } : {}) });
      } catch { this.normalizer.recordFailure(); }
    }
    const snapshot = this.normalizer.snapshot();
    if (!snapshot.value) return null;
    const metricsByName = new Map(snapshot.value.nodeMetrics?.items.map((item) => [item.metadata.name, item]));
    const hosts = snapshot.value.nodes.items.map((node) => nodeHost(node, metricsByName.get(node.metadata.name), snapshot.metadata));
    const workloads = [workloadRecords('deployment', snapshot.value.deployments, snapshot.metadata), workloadRecords('statefulset', snapshot.value.statefulSets, snapshot.metadata), workloadRecords('daemonset', snapshot.value.daemonSets, snapshot.metadata)].flat();
    const sum = (values: Array<number | null>) => values.some((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
    return { hosts, workloads, cluster: { id: 'k3s', name: 'k3s', platform: 'K3S', nodeCount: hosts.length, readyNodeCount: hosts.filter((host) => host.metadata.severity === 'OK').length, workloadCount: workloads.length, cpuCapacityCores: sum(snapshot.value.nodes.items.map((node) => quantity(node.status.capacity?.cpu, 'cpu'))), cpuUsedCores: sum(snapshot.value.nodeMetrics?.items.map((node) => quantity(node.usage.cpu, 'cpu')) ?? []), memoryCapacityBytes: sum(snapshot.value.nodes.items.map((node) => quantity(node.status.capacity?.memory, 'memory'))), memoryUsedBytes: sum(snapshot.value.nodeMetrics?.items.map((node) => quantity(node.usage.memory, 'memory')) ?? []), metadata: snapshot.metadata } };
  }
}
