import { describe, expect, it } from 'vitest';
import { GlancesAdapter, type GlancesFetch } from './glances.js';
import type { Clock } from './normalization.js';

const clock: Clock = { now: () => new Date('2026-07-19T12:00:00.000Z') };
const hosts = [{ id: 'pve-01', name: 'pve-01', endpoint: 'http://192.168.40.20:61208' }];

describe('temporary Glances bridge', () => {
  it('normalizes only approved host summary fields and tolerates missing sensors/devices', async () => {
    const fetcher: GlancesFetch = async () => ({ ok: true, json: async () => ({ cpu: { total: 42 }, mem: { percent: 58, used: 100, total: 200 }, fs: [{ mnt_point: '/', used: 40, size: 100 }], network: { vmbr0: { rx: 10, tx: 20, cumulative_cx: 30_000 } }, uptime: 60 }) });
    const host = (await new GlancesAdapter(hosts, fetcher, true, clock).read())[0]!;
    expect(host).toMatchObject({ cpuPercent: 42, memoryPercent: 58, diskUsedBytes: 40, networkIngressBitsPerSecond: 80, networkEgressBitsPerSecond: 160, networkTotalBytes: 30_000, temperatureCelsius: null });
    expect(host).not.toHaveProperty('raw');
  });

  it('uses Glances v4 interface rate fields when the network payload is an array', async () => {
    const fetcher: GlancesFetch = async () => ({ ok: true, json: async () => ({
      cpu: { total: 3 }, mem: { percent: 51 }, fs: [], uptime: '6 days, 10:40:27',
      network: [{ interface_name: 'vmbr0', bytes_recv_rate_per_sec: 8_558, bytes_sent_rate_per_sec: 12_739, bytes_all_gauge: 9_242_285_709 }],
    }) });
    const host = (await new GlancesAdapter(hosts, fetcher, true, clock).read())[0]!;
    expect(host).toMatchObject({ networkIngressBitsPerSecond: 68_464, networkEgressBitsPerSecond: 101_912, networkTotalBytes: 9_242_285_709 });
  });

  it('uses an explicit unsupported state when the temporary bridge is disabled', async () => {
    const fetcher: GlancesFetch = async () => { throw new Error('must not be called'); };
    const host = (await new GlancesAdapter(hosts, fetcher, false, clock).read())[0]!;
    expect(host.metadata.freshness).toBe('NOT_SUPPORTED');
  });
});
