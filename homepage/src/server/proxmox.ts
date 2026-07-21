import { z } from 'zod';
import type { Host, SourceMetadata } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock } from './normalization.js';

const NodeResponseSchema = z.object({ data: z.object({
  cpu: z.number().nonnegative().optional(),
  // Proxmox reports host I/O wait as a 0–1 fraction of CPU time.
  wait: z.number().nonnegative().optional(),
  cpuinfo: z.object({ model: z.string().min(1).optional(), mhz: z.union([z.string(), z.number()]).optional(), cpus: z.number().int().positive().optional() }).optional(),
  loadavg: z.array(z.union([z.string(), z.number()])).length(3).optional(),
  memory: z.object({ used: z.number().nonnegative(), total: z.number().positive() }).optional(),
  swap: z.object({ used: z.number().nonnegative(), total: z.number().positive() }).optional(),
  rootfs: z.object({ used: z.number().nonnegative(), total: z.number().positive() }).optional(),
  uptime: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
}) });
const ResourcesResponseSchema = z.object({ data: z.array(z.object({
  // /cluster/resources is intentionally a mixed inventory response: it also
  // contains node and storage rows.  Validate the common fields, then select
  // the two guest kinds below rather than rejecting the entire response.
  type: z.string().min(1),
  node: z.string().min(1).optional(),
  status: z.string().optional(),
})) });
const StorageResponseSchema = z.object({ data: z.array(z.object({
  total: z.number().nonnegative().optional(),
  used: z.number().nonnegative().optional(),
})) });

type ProxmoxSnapshot = {
  node: z.infer<typeof NodeResponseSchema>['data'];
  resources?: z.infer<typeof ResourcesResponseSchema>['data'];
  storage?: z.infer<typeof StorageResponseSchema>['data'];
  partial: boolean;
};

export interface ProxmoxFetchResponse { ok: boolean; json(): Promise<unknown>; }
export type ProxmoxFetch = (url: string, init: { headers: { authorization: string } }) => Promise<ProxmoxFetchResponse>;
export interface ProxmoxHostConfig {
  id: string;
  name: string;
  node: string;
  server: string;
  tokenId: string;
  tokenSecret: string;
}

function emptyHost(config: ProxmoxHostConfig, metadata: SourceMetadata): Host {
  return { id: config.id, name: config.name, kind: 'PROXMOX', cpuPercent: null, memoryPercent: null, memoryUsedBytes: null, memoryTotalBytes: null, diskUsedBytes: null, diskTotalBytes: null, diskIoPercent: null, cpuModel: null, cpuCorePercentages: null, loadAverage: null, cpuClockMhz: null, powerWatts: null, swapUsedBytes: null, swapTotalBytes: null, uptimeSeconds: null, runningVmCount: null, stoppedVmCount: null, runningContainerCount: null, stoppedContainerCount: null, temperatureCelsius: null, networkIngressBitsPerSecond: null, networkEgressBitsPerSecond: null, networkTotalBytes: null, metadata };
}

function request(server: string, path: string, authorization: string, fetcher: ProxmoxFetch) {
  return withTimeout(fetcher(`${server.replace(/\/$/, '')}${path}`, { headers: { authorization } }), 5_000);
}

function requiredData<T>(response: ProxmoxFetchResponse, schema: z.ZodType<T>) {
  if (!response.ok) throw new Error('Proxmox request failed.');
  return response.json().then((body) => schema.parse(body));
}

export class ProxmoxAdapter {
  private readonly normalizers = new Map<string, SourceNormalizer<ProxmoxSnapshot>>();

  constructor(private readonly hosts: ProxmoxHostConfig[], private readonly enabled: boolean, private readonly clock?: Clock) {
    for (const host of hosts) this.normalizers.set(host.id, new SourceNormalizer({ source: `proxmox:${host.id}`, staleAfterMs: 30_000, unsupported: !enabled, ...(clock ? { clock } : {}) }));
  }

  async read(fetcher: ProxmoxFetch): Promise<Host[]> {
    return Promise.all(this.hosts.map(async (host) => {
      const normalizer = this.normalizers.get(host.id)!;
      if (this.enabled && normalizer.canAttempt()) {
        try {
          const authorization = `PVEAPIToken=${host.tokenId}=${host.tokenSecret}`;
          const node = await requiredData(await request(host.server, `/nodes/${encodeURIComponent(host.node)}/status`, authorization, fetcher), NodeResponseSchema);
          const [resources, storage] = await Promise.allSettled([
            request(host.server, '/cluster/resources', authorization, fetcher).then((response) => requiredData(response, ResourcesResponseSchema)),
            request(host.server, `/nodes/${encodeURIComponent(host.node)}/storage`, authorization, fetcher).then((response) => requiredData(response, StorageResponseSchema)),
          ]);
          normalizer.recordSuccess({
            node: node.data,
            ...(resources.status === 'fulfilled' ? { resources: resources.value.data } : {}),
            ...(storage.status === 'fulfilled' ? { storage: storage.value.data } : {}),
            partial: resources.status === 'rejected' || storage.status === 'rejected',
          });
        } catch { normalizer.recordFailure(); }
      }
      const snapshot = normalizer.snapshot();
      const output = emptyHost(host, snapshot.metadata);
      if (!snapshot.value) return output;
      const { node, resources = [], storage = [], partial } = snapshot.value;
      const hasGuestInventory = snapshot.value.resources !== undefined;
      const guests = resources.filter((resource) => resource.node === host.node);
      const vm = guests.filter((resource) => resource.type === 'qemu');
      const container = guests.filter((resource) => resource.type === 'lxc');
      const count = (entries: typeof guests, status: 'running' | 'stopped') => entries.filter((entry) => entry.status?.toLowerCase() === status).length;
      const memoryPercent = node.memory ? Math.round((node.memory.used / node.memory.total) * 100) : null;
      const metadata: SourceMetadata = {
        ...snapshot.metadata,
        ...(node.status !== undefined && node.status.toLowerCase() !== 'online' ? { severity: 'CRIT' as const, message: 'Proxmox node is not online.' } : partial ? { message: 'Some approved Proxmox metrics are unavailable.' } : {}),
      };
      return {
        ...output,
        cpuPercent: node.cpu === undefined ? null : Math.round(Math.min(1, node.cpu) * 100),
        diskIoPercent: node.wait === undefined ? null : Math.round(Math.min(1, node.wait) * 1_000) / 10,
        memoryPercent,
        memoryUsedBytes: node.memory?.used ?? null,
        memoryTotalBytes: node.memory?.total ?? null,
        diskUsedBytes: (storage.reduce((total, entry) => total + (entry.used ?? 0), 0) || node.rootfs?.used) ?? null,
        diskTotalBytes: (storage.reduce((total, entry) => total + (entry.total ?? 0), 0) || node.rootfs?.total) ?? null,
        cpuModel: node.cpuinfo?.model ? `${node.cpuinfo.model}${node.cpuinfo.cpus ? ` · ${node.cpuinfo.cpus}T` : ''}` : null,
        cpuClockMhz: node.cpuinfo?.mhz === undefined ? null : Number(node.cpuinfo.mhz),
        loadAverage: node.loadavg?.map(Number) as Host['loadAverage'] ?? null,
        swapUsedBytes: node.swap?.used ?? null,
        swapTotalBytes: node.swap?.total ?? null,
        uptimeSeconds: node.uptime ?? null,
        runningVmCount: hasGuestInventory ? count(vm, 'running') : null,
        stoppedVmCount: hasGuestInventory ? count(vm, 'stopped') : null,
        runningContainerCount: hasGuestInventory ? count(container, 'running') : null,
        stoppedContainerCount: hasGuestInventory ? count(container, 'stopped') : null,
        metadata,
      };
    }));
  }
}
