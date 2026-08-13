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

type OkdNodeMonitoring = {
  loadAverage: Host['loadAverage'];
  cpuCorePercentages: number[] | null;
};

const allowedNodes = ['okd-cp-01', 'okd-cp-02', 'okd-cp-03'] as const;
const nodePattern = 'okd-cp-0[123](\\.okd\\.lab\\.seandre\\.dev)?';
const nodeInfo = `node_uname_info{nodename=~"${nodePattern}"}`;

export const OKD_MONITORING_QUERIES = {
  load1: `max by (nodename) (node_load1 * on(instance) group_left(nodename) ${nodeInfo})`,
  load5: `max by (nodename) (node_load5 * on(instance) group_left(nodename) ${nodeInfo})`,
  load15: `max by (nodename) (node_load15 * on(instance) group_left(nodename) ${nodeInfo})`,
  cores: `100 - (avg by (nodename, cpu) (rate(node_cpu_seconds_total{mode="idle"}[5m]) * on(instance) group_left(nodename) ${nodeInfo}) * 100)`,
} as const;

function sampleValue(sample: z.infer<typeof QueryResponseSchema>['data']['result'][number]) {
  const value = Number(sample.value[1]);
  return Number.isFinite(value) ? value : null;
}

function sampleNode(metric: Record<string, string>) {
  const candidate = metric.node ?? metric.nodename ?? metric.instance?.split(':')[0] ?? '';
  const normalized = normalizeOkdNodeName(candidate);
  return allowedNodes.includes(normalized as typeof allowedNodes[number]) ? normalized : null;
}

function normalizedSnapshot(responses: Array<z.infer<typeof QueryResponseSchema>>) {
  const output = new Map<string, OkdNodeMonitoring>(allowedNodes.map((name) => [name, { loadAverage: null, cpuCorePercentages: null }]));
  for (const [loadIndex, response] of responses.slice(0, 3).entries()) {
    for (const sample of response.data.result) {
      const name = sampleNode(sample.metric);
      const value = sampleValue(sample);
      const current = name ? output.get(name) : undefined;
      if (!current || value === null) continue;
      const load = [...(current.loadAverage ?? [0, 0, 0])] as [number, number, number];
      load[loadIndex] = Number(value.toFixed(2));
      current.loadAverage = load;
    }
  }
  const cores = new Map<string, Array<{ index: number; value: number }>>();
  for (const sample of responses[3]?.data.result ?? []) {
    const name = sampleNode(sample.metric);
    const value = sampleValue(sample);
    const index = Number(sample.metric.cpu);
    if (!name || value === null || !Number.isInteger(index) || index < 0) continue;
    const values = cores.get(name) ?? [];
    values.push({ index, value: Math.max(0, Math.min(100, Number(value.toFixed(1)))) });
    cores.set(name, values);
  }
  for (const [name, values] of cores) output.get(name)!.cpuCorePercentages = values.sort((left, right) => left.index - right.index).map((item) => item.value);
  return output;
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
        const responses = await withTimeout(Promise.all(Object.values(OKD_MONITORING_QUERIES).map(async (query) => {
          const endpoint = new URL(`${this.server}/api/v1/query`);
          endpoint.searchParams.set('query', query);
          const response = await fetcher(endpoint.toString());
          if (!response.ok) throw new Error('OKD monitoring request failed.');
          return QueryResponseSchema.parse(await response.json());
        })), this.timeoutMs);
        this.normalizer.recordSuccess(normalizedSnapshot(responses));
      } catch { this.normalizer.recordFailure(); }
    }
    return this.normalizer.snapshot();
  }
}
