import { z } from 'zod';
import type { Host } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock } from './normalization.js';
import { normalizeOkdNodeName } from './okd.js';

export const OKD_THANOS_SERVER = 'https://thanos-querier-openshift-monitoring.apps.okd.lab.seandre.dev';
export const OKD_MONITORING_POLL_INTERVAL_MS = 15_000;
export const OKD_MONITORING_REQUEST_TIMEOUT_MS = 3_000;

const QueryResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    resultType: z.literal('vector'),
    result: z.array(z.object({
      metric: z.record(z.string(), z.string()),
      value: z.tuple([z.union([z.number(), z.string()]), z.string()]),
    })),
  }),
});

export interface OkdMonitoringFetchResponse { ok: boolean; json(): Promise<unknown>; }
export type OkdMonitoringFetch = (url: string) => Promise<OkdMonitoringFetchResponse>;

type OkdNodeMonitoring = Pick<Host,
  'loadAverage' | 'cpuCorePercentages' | 'diskUsedBytes' | 'diskTotalBytes' |
  'diskIoPercent' | 'swapUsedBytes' | 'swapTotalBytes' | 'uptimeSeconds' |
  'runningContainerCount' | 'stoppedContainerCount' | 'temperatureCelsius' |
  'networkIngressBitsPerSecond' | 'networkEgressBitsPerSecond' | 'networkTotalBytes'
>;

const allowedNodes = ['okd-cp-01', 'okd-cp-02', 'okd-cp-03'] as const;
// PromQL string literals must contain two backslashes so the PromQL parser
// passes one escaped dot through to the RE2 regular expression.
const nodePattern = 'okd-cp-0[123](\\\\.okd\\\\.lab\\\\.seandre\\\\.dev)?';
const nodeInfo = `node_uname_info{nodename=~"${nodePattern}"}`;

export const OKD_MONITORING_QUERIES = {
  load1: `max by (nodename) (node_load1 * on(instance) group_left(nodename) ${nodeInfo})`,
  load5: `max by (nodename) (node_load5 * on(instance) group_left(nodename) ${nodeInfo})`,
  load15: `max by (nodename) (node_load15 * on(instance) group_left(nodename) ${nodeInfo})`,
  cores: `100 - (avg by (nodename, cpu) (rate(node_cpu_seconds_total{mode="idle"}[5m]) * on(instance) group_left(nodename) ${nodeInfo}) * 100)`,
  diskTotal: `max by (nodename) (node_filesystem_size_bytes{mountpoint="/sysroot",fstype="xfs"} * on(instance) group_left(nodename) ${nodeInfo})`,
  diskAvailable: `max by (nodename) (node_filesystem_avail_bytes{mountpoint="/sysroot",fstype="xfs"} * on(instance) group_left(nodename) ${nodeInfo})`,
  diskIo: `clamp_max(max by (nodename) (rate(node_disk_io_time_seconds_total{device="nvme0n1"}[5m]) * on(instance) group_left(nodename) ${nodeInfo}) * 100, 100)`,
  networkIngress: `clamp_min(max by (nodename) (rate(node_network_receive_bytes_total{device="eno1"}[5m]) * 8 * on(instance) group_left(nodename) ${nodeInfo}), 0)`,
  networkEgress: `clamp_min(max by (nodename) (rate(node_network_transmit_bytes_total{device="eno1"}[5m]) * 8 * on(instance) group_left(nodename) ${nodeInfo}), 0)`,
  networkTotal: `max by (nodename) ((node_network_receive_bytes_total{device="eno1"} + node_network_transmit_bytes_total{device="eno1"}) * on(instance) group_left(nodename) ${nodeInfo})`,
  swapTotal: `max by (nodename) (node_memory_SwapTotal_bytes * on(instance) group_left(nodename) ${nodeInfo})`,
  swapFree: `max by (nodename) (node_memory_SwapFree_bytes * on(instance) group_left(nodename) ${nodeInfo})`,
  temperature: `max by (nodename) (node_hwmon_temp_celsius * on(instance) group_left(nodename) ${nodeInfo})`,
  uptime: `max by (nodename) ((time() - node_boot_time_seconds) * on(instance) group_left(nodename) ${nodeInfo})`,
  runningContainers: `max by (node) (kubelet_running_containers{container_state="running",node=~"${nodePattern}"})`,
  stoppedContainers: `sum by (node) (kubelet_running_containers{container_state=~"created|exited",node=~"${nodePattern}"})`,
} as const;

type QueryName = keyof typeof OKD_MONITORING_QUERIES;
type QueryResponse = z.infer<typeof QueryResponseSchema>;

function sampleValue(sample: z.infer<typeof QueryResponseSchema>['data']['result'][number]) {
  const value = Number(sample.value[1]);
  return Number.isFinite(value) ? value : null;
}

function sampleNode(metric: Record<string, string>) {
  const candidate = metric.node ?? metric.nodename ?? metric.instance?.split(':')[0] ?? '';
  const normalized = normalizeOkdNodeName(candidate);
  return allowedNodes.includes(normalized as typeof allowedNodes[number]) ? normalized : null;
}

function valuesByNode(response: QueryResponse) {
  const output = new Map<string, number>();
  for (const sample of response.data.result) {
    const name = sampleNode(sample.metric);
    const value = sampleValue(sample);
    if (name && value !== null) output.set(name, value);
  }
  return output;
}

function normalizedSnapshot(responses: Record<QueryName, QueryResponse>) {
  const values = Object.fromEntries(Object.entries(responses).map(([name, response]) => [name, valuesByNode(response)])) as Record<QueryName, Map<string, number>>;
  const cores = new Map<string, Array<{ index: number; value: number }>>();
  for (const sample of responses.cores.data.result) {
    const name = sampleNode(sample.metric);
    const value = sampleValue(sample);
    const index = Number(sample.metric.cpu);
    if (!name || value === null || !Number.isInteger(index) || index < 0) continue;
    const values = cores.get(name) ?? [];
    values.push({ index, value: Math.max(0, Math.min(100, Number(value.toFixed(1)))) });
    cores.set(name, values);
  }
  return new Map<string, OkdNodeMonitoring>(allowedNodes.map((name) => {
    const loads = [values.load1.get(name), values.load5.get(name), values.load15.get(name)];
    const diskTotal = values.diskTotal.get(name) ?? null;
    const diskAvailable = values.diskAvailable.get(name) ?? null;
    const swapTotal = values.swapTotal.get(name) ?? null;
    const swapFree = values.swapFree.get(name) ?? null;
    return [name, {
      loadAverage: loads.every((value) => value !== undefined) ? loads.map((value) => Number(value!.toFixed(2))) as [number, number, number] : null,
      cpuCorePercentages: cores.get(name)?.sort((left, right) => left.index - right.index).map((item) => item.value) ?? null,
      diskTotalBytes: diskTotal === null ? null : Math.round(diskTotal),
      diskUsedBytes: diskTotal === null || diskAvailable === null ? null : Math.round(Math.max(0, diskTotal - diskAvailable)),
      diskIoPercent: values.diskIo.has(name) ? Number(Math.max(0, values.diskIo.get(name)!).toFixed(1)) : null,
      networkIngressBitsPerSecond: values.networkIngress.has(name) ? Math.round(Math.max(0, values.networkIngress.get(name)!)) : null,
      networkEgressBitsPerSecond: values.networkEgress.has(name) ? Math.round(Math.max(0, values.networkEgress.get(name)!)) : null,
      networkTotalBytes: values.networkTotal.has(name) ? Math.round(Math.max(0, values.networkTotal.get(name)!)) : null,
      swapTotalBytes: swapTotal === null ? null : Math.round(Math.max(0, swapTotal)),
      swapUsedBytes: swapTotal === null || swapFree === null ? null : Math.round(Math.max(0, swapTotal - swapFree)),
      temperatureCelsius: values.temperature.has(name) ? Number(values.temperature.get(name)!.toFixed(1)) : null,
      uptimeSeconds: values.uptime.has(name) ? Math.round(Math.max(0, values.uptime.get(name)!)) : null,
      runningContainerCount: values.runningContainers.has(name) ? Math.round(Math.max(0, values.runningContainers.get(name)!)) : null,
      stoppedContainerCount: values.stoppedContainers.has(name) ? Math.round(Math.max(0, values.stoppedContainers.get(name)!)) : null,
    }];
  }));
}

export class OkdMonitoringAdapter {
  private readonly normalizer: SourceNormalizer<Map<string, OkdNodeMonitoring>>;
  private lastAttemptMs = Number.NEGATIVE_INFINITY;

  constructor(private readonly server = OKD_THANOS_SERVER, private readonly clock: Clock = { now: () => new Date() }, private readonly timeoutMs = OKD_MONITORING_REQUEST_TIMEOUT_MS) {
    this.normalizer = new SourceNormalizer({ source: 'okd-thanos', staleAfterMs: 30_000, failureThreshold: 2, successThreshold: 2, circuitCooldownMs: OKD_MONITORING_POLL_INTERVAL_MS, clock });
  }

  async read(fetcher: OkdMonitoringFetch) {
    const nowMs = this.clock.now().getTime();
    if (nowMs - this.lastAttemptMs >= OKD_MONITORING_POLL_INTERVAL_MS && this.normalizer.canAttempt()) {
      this.lastAttemptMs = nowMs;
      try {
        const responses = await withTimeout(Promise.all(Object.entries(OKD_MONITORING_QUERIES).map(async ([name, query]) => {
          const endpoint = new URL(`${this.server}/api/v1/query`);
          endpoint.searchParams.set('query', query);
          const response = await fetcher(endpoint.toString());
          if (!response.ok) throw new Error('OKD monitoring request failed.');
          return [name, QueryResponseSchema.parse(await response.json())] as const;
        })), this.timeoutMs);
        this.normalizer.recordSuccess(normalizedSnapshot(Object.fromEntries(responses) as Record<QueryName, QueryResponse>));
      } catch { this.normalizer.recordFailure(); }
    }
    return this.normalizer.snapshot();
  }
}
