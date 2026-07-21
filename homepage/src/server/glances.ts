import { z } from 'zod';
import type { Host } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock } from './normalization.js';

const DiskIoEntrySchema = z.object({ read_bytes: z.number().nonnegative().optional(), write_bytes: z.number().nonnegative().optional() });
const NetworkEntrySchema = z.object({
  interface_name: z.string().optional(),
  rx: z.number().nonnegative().optional(),
  tx: z.number().nonnegative().optional(),
  bytes_recv_rate_per_sec: z.number().nonnegative().optional(),
  bytes_sent_rate_per_sec: z.number().nonnegative().optional(),
  bytes_all_gauge: z.number().nonnegative().optional(),
  bytes_recv_gauge: z.number().nonnegative().optional(),
  bytes_sent_gauge: z.number().nonnegative().optional(),
  cumulative_cx: z.number().nonnegative().optional(),
  cumulative_rx: z.number().nonnegative().optional(),
  cumulative_tx: z.number().nonnegative().optional(),
});

const GlancesResponseSchema = z.object({
  cpu: z.object({ total: z.number().min(0).max(100) }).optional(),
  percpu: z.array(z.object({ total: z.number().min(0).max(100) })).optional(),
  mem: z.object({ percent: z.number().min(0).max(100), used: z.number().nonnegative().optional(), total: z.number().positive().optional() }).optional(),
  memswap: z.object({ used: z.number().nonnegative().optional(), total: z.number().positive().optional() }).optional(),
  fs: z.array(z.object({ mnt_point: z.string(), used: z.number().nonnegative().optional(), size: z.number().positive().optional() })).optional(),
  diskio: z.union([z.record(z.string(), DiskIoEntrySchema), z.array(DiskIoEntrySchema)]).optional(),
  network: z.union([z.record(z.string(), NetworkEntrySchema), z.array(NetworkEntrySchema)]).optional(),
  sensors: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
  uptime: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
});
export interface GlancesFetchResponse { ok: boolean; json(): Promise<unknown>; }
export type GlancesFetch = (url: string) => Promise<GlancesFetchResponse>;
export interface GlancesHostConfig { id: string; name: string; endpoint: string; }
export const GLANCES_TIMEOUT_MS = 1_500;

function nullHost(config: GlancesHostConfig, metadata: Host['metadata']): Host {
  return { id: config.id, name: config.name, kind: 'PROXMOX', cpuPercent: null, memoryPercent: null, memoryUsedBytes: null, memoryTotalBytes: null, diskUsedBytes: null, diskTotalBytes: null, diskIoPercent: null, cpuModel: null, cpuCorePercentages: null, loadAverage: null, cpuClockMhz: null, powerWatts: null, swapUsedBytes: null, swapTotalBytes: null, uptimeSeconds: null, runningVmCount: null, stoppedVmCount: null, runningContainerCount: null, stoppedContainerCount: null, temperatureCelsius: null, networkIngressBitsPerSecond: null, networkEgressBitsPerSecond: null, networkTotalBytes: null, metadata };
}

function entries<T>(value: Record<string, T> | T[] | undefined): T[] {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

export class GlancesAdapter {
  private readonly normalizers = new Map<string, SourceNormalizer<z.infer<typeof GlancesResponseSchema>>>();
  constructor(private readonly hosts: GlancesHostConfig[], private readonly fetcher: GlancesFetch, private readonly enabled: boolean, private readonly clock?: Clock) {
    for (const host of hosts) this.normalizers.set(host.id, new SourceNormalizer({ source: `glances:${host.id}`, staleAfterMs: 30_000, unsupported: !enabled, ...(clock ? { clock } : {}) }));
  }

  async read(): Promise<Host[]> {
    return Promise.all(this.hosts.map(async (host) => {
      const normalizer = this.normalizers.get(host.id)!;
      if (this.enabled && normalizer.canAttempt()) {
        try {
          const response = await withTimeout(this.fetcher(`${host.endpoint}/api/4/all`), GLANCES_TIMEOUT_MS);
          if (!response.ok) throw new Error('Glances request failed.');
          normalizer.recordSuccess(GlancesResponseSchema.parse(await response.json()));
        } catch { normalizer.recordFailure(); }
      }
      const normalized = normalizer.snapshot();
      const output = nullHost(host, normalized.metadata);
      if (!normalized.value) return output;
      const fs = normalized.value.fs?.find((entry) => entry.mnt_point === '/') ?? normalized.value.fs?.[0];
      const disk = entries(normalized.value.diskio)[0];
      const networkEntries = entries(normalized.value.network);
      const network = networkEntries.find((entry) => entry.interface_name === 'vmbr0') ?? networkEntries[0];
      const networkIngressBytes = network?.bytes_recv_rate_per_sec ?? network?.rx;
      const networkEgressBytes = network?.bytes_sent_rate_per_sec ?? network?.tx;
      const networkTotalBytes = network?.bytes_all_gauge ?? network?.cumulative_cx ?? (network?.bytes_recv_gauge !== undefined && network?.bytes_sent_gauge !== undefined ? network.bytes_recv_gauge + network.bytes_sent_gauge : network?.cumulative_rx !== undefined && network?.cumulative_tx !== undefined ? network.cumulative_rx + network.cumulative_tx : null);
      const temp = normalized.value.sensors?.find((sensor) => /package|cpu temp/i.test(sensor.label))?.value ?? null;
      return { ...output, cpuPercent: normalized.value.cpu?.total ?? null, cpuCorePercentages: normalized.value.percpu?.map((cpu) => cpu.total) ?? null, memoryPercent: normalized.value.mem?.percent ?? null, memoryUsedBytes: normalized.value.mem?.used ?? null, memoryTotalBytes: normalized.value.mem?.total ?? null, swapUsedBytes: normalized.value.memswap?.used ?? null, swapTotalBytes: normalized.value.memswap?.total ?? null, diskUsedBytes: fs?.used ?? null, diskTotalBytes: fs?.size ?? null, diskIoPercent: disk ? null : null, temperatureCelsius: temp, uptimeSeconds: typeof normalized.value.uptime === 'number' ? normalized.value.uptime : null, networkIngressBitsPerSecond: networkIngressBytes === undefined ? null : networkIngressBytes * 8, networkEgressBitsPerSecond: networkEgressBytes === undefined ? null : networkEgressBytes * 8, networkTotalBytes };
    }));
  }
}
