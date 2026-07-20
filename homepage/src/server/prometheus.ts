import { z } from 'zod';
import type { SourceMetadata } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock } from './normalization.js';

const QueryResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({ resultType: z.literal('vector'), result: z.array(z.object({ value: z.tuple([z.union([z.number(), z.string()]), z.string()]) })) }),
});

export interface PrometheusFetchResponse { ok: boolean; json(): Promise<unknown>; }
export type PrometheusFetch = (url: string) => Promise<PrometheusFetchResponse>;
export interface PrometheusClusterMetrics {
  cpuCapacityCores: number | null;
  cpuUsedCores: number | null;
  memoryCapacityBytes: number | null;
  memoryUsedBytes: number | null;
}
export interface PduPowerMetrics {
  totalWatts: number | null;
  pve01Watts: number | null;
  pve02Watts: number | null;
  metadata: SourceMetadata;
}

export interface PduPowerConfig {
  enabled: boolean;
  deviceName: string;
}

// This catalog is deliberately fixed: the browser cannot send PromQL, metric
// names, labels, or endpoints to the backend.
const queries = {
  cpuCapacityCores: 'sum(kube_node_status_capacity{resource="cpu"})',
  memoryCapacityBytes: 'sum(kube_node_status_capacity{resource="memory"})',
  cpuUsedCores: 'sum(rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))',
  memoryUsedBytes: 'sum(container_memory_working_set_bytes{container!="",image!=""})',
} as const;

function promqlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// This is deliberately a fixed three-query catalog. Device and outlet names
// come from the Git-owned runtime configuration, never from the browser.
export function buildPduPowerQueries(deviceName: string) {
  const name = promqlString(deviceName);
  const selector = `unpoller_device_outlet_outlet_power{name="${name}"}`;
  return {
    totalWatts: `sum(${selector})`,
    pve01Watts: `sum(${selector.replace('}', ',outlet_name="pve-01"}')})`,
    pve02Watts: `sum(${selector.replace('}', ',outlet_name="pve-02"}')})`,
  } as const;
}

function scalar(response: z.infer<typeof QueryResponseSchema>) {
  const raw = response.data.result[0]?.value[1];
  const parsed = raw === undefined ? null : Number(raw);
  return parsed === null || !Number.isFinite(parsed) ? null : parsed;
}

export class PrometheusAdapter {
  private readonly normalizer: SourceNormalizer<PrometheusClusterMetrics>;
  private readonly pduNormalizer: SourceNormalizer<Omit<PduPowerMetrics, 'metadata'>>;

  constructor(private readonly server: string, enabled: boolean, private readonly pduConfig: PduPowerConfig = { enabled: false, deviceName: 'unvalidated' }, clock?: Clock) {
    this.normalizer = new SourceNormalizer({ source: 'prometheus-api', staleAfterMs: 45_000, unsupported: !enabled, ...(clock ? { clock } : {}) });
    this.pduNormalizer = new SourceNormalizer({ source: 'unpoller-pdu-power', staleAfterMs: 75_000, unsupported: !enabled || !pduConfig.enabled, ...(clock ? { clock } : {}) });
  }

  async readCluster(fetcher: PrometheusFetch): Promise<PrometheusClusterMetrics | null> {
    if (this.normalizer.canAttempt()) {
      try {
        const read = async (query: string) => {
          const endpoint = new URL(`${this.server.replace(/\/$/, '')}/api/v1/query`);
          endpoint.searchParams.set('query', query);
          const response = await withTimeout(fetcher(endpoint.toString()), 3_000);
          if (!response.ok) throw new Error('Prometheus request failed.');
          return scalar(QueryResponseSchema.parse(await response.json()));
        };
        const values = await Promise.all(Object.values(queries).map(read));
        this.normalizer.recordSuccess({ cpuCapacityCores: values[0] ?? null, memoryCapacityBytes: values[1] ?? null, cpuUsedCores: values[2] ?? null, memoryUsedBytes: values[3] ?? null });
      } catch { this.normalizer.recordFailure(); }
    }
    return this.normalizer.snapshot().value ?? null;
  }

  async readPduPower(fetcher: PrometheusFetch): Promise<PduPowerMetrics> {
    if (this.pduConfig.enabled && this.pduNormalizer.canAttempt()) {
      try {
        const read = async (query: string) => {
          const endpoint = new URL(`${this.server.replace(/\/$/, '')}/api/v1/query`);
          endpoint.searchParams.set('query', query);
          const response = await withTimeout(fetcher(endpoint.toString()), 3_000);
          if (!response.ok) throw new Error('Prometheus request failed.');
          return scalar(QueryResponseSchema.parse(await response.json()));
        };
        const catalog = buildPduPowerQueries(this.pduConfig.deviceName);
        const values = await Promise.all(Object.values(catalog).map(read));
        // A missing outlet must never be converted into a partial host or total
        // value. Zero is valid and remains distinct from no returned series.
        if (values.some((sample) => sample === null)) throw new Error('PDU mapping did not return every validated outlet.');
        this.pduNormalizer.recordSuccess({ totalWatts: values[0]!, pve01Watts: values[1]!, pve02Watts: values[2]! });
      } catch { this.pduNormalizer.recordFailure(); }
    }
    const snapshot = this.pduNormalizer.snapshot();
    return { totalWatts: snapshot.value?.totalWatts ?? null, pve01Watts: snapshot.value?.pve01Watts ?? null, pve02Watts: snapshot.value?.pve02Watts ?? null, metadata: snapshot.metadata };
  }
}
