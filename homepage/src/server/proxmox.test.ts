import { describe, expect, it } from 'vitest';
import { ProxmoxAdapter, type ProxmoxFetch } from './proxmox.js';
import type { Clock } from './normalization.js';

const clock: Clock = { now: () => new Date('2026-07-19T12:00:00.000Z') };
const host = { id: 'pve-01', name: 'pve-01', node: 'pve01', server: 'https://pve-01.lab.seandre.dev:8006/api2/json', tokenId: 'homepage@pve!dashboard', tokenSecret: 'test-secret' };
const pve02 = { id: 'pve-02', name: 'pve-02', node: 'pve-02', server: 'https://pve-02.lab.seandre.dev:8006/api2/json', tokenId: 'homepage@pve!dashboard', tokenSecret: 'test-secret' };

describe('Proxmox read-only adapter', () => {
  it('uses only approved read endpoints and emits aggregate host data without guest metadata', async () => {
    const seen: Array<{ url: string; authorization: string }> = [];
    const fetcher: ProxmoxFetch = async (url, init) => {
      seen.push({ url, authorization: init.headers.authorization });
      if (url.endsWith('/status')) return { ok: true, json: async () => ({ data: { cpu: 0.42, memory: { used: 58, total: 100 }, swap: { used: 3, total: 10 }, uptime: 600, status: 'online' } }) };
      if (url.endsWith('/storage')) return { ok: true, json: async () => ({ data: [{ total: 1_000, used: 400 }] }) };
      return { ok: true, json: async () => ({ data: [{ type: 'node', node: 'pve01', status: 'online' }, { type: 'storage', storage: 'local' }, { type: 'qemu', node: 'pve01', status: 'running', name: 'never-exposed' }, { type: 'qemu', node: 'pve01', status: 'stopped' }, { type: 'lxc', node: 'pve01', status: 'running' }] }) };
    };
    const result = (await new ProxmoxAdapter([host], true, clock).read(fetcher))[0]!;
    expect(seen).toEqual(expect.arrayContaining([
      { url: 'https://pve-01.lab.seandre.dev:8006/api2/json/nodes/pve01/status', authorization: 'PVEAPIToken=homepage@pve!dashboard=test-secret' },
      { url: 'https://pve-01.lab.seandre.dev:8006/api2/json/cluster/resources', authorization: 'PVEAPIToken=homepage@pve!dashboard=test-secret' },
      { url: 'https://pve-01.lab.seandre.dev:8006/api2/json/nodes/pve01/storage', authorization: 'PVEAPIToken=homepage@pve!dashboard=test-secret' },
    ]));
    expect(result).toMatchObject({ cpuPercent: 42, memoryPercent: 58, diskUsedBytes: 400, runningVmCount: 1, stoppedVmCount: 1, runningContainerCount: 1, stoppedContainerCount: 0, metadata: { freshness: 'CURRENT', severity: 'OK' } });
    expect(result).not.toHaveProperty('nameFromUpstream');
    expect(JSON.stringify(result)).not.toContain('never-exposed');
  });

  it('keeps node data when optional storage or guest summaries are unavailable', async () => {
    const fetcher: ProxmoxFetch = async (url) => {
      if (url.endsWith('/status')) return { ok: true, json: async () => ({ data: { cpu: 0.1, status: 'online' } }) };
      return { ok: false, json: async () => ({}) };
    };
    const result = (await new ProxmoxAdapter([host], true, clock).read(fetcher))[0]!;
    expect(result).toMatchObject({ cpuPercent: 10, diskTotalBytes: null, runningVmCount: null, metadata: { freshness: 'CURRENT', message: 'Some approved Proxmox metrics are unavailable.' } });
  });

  it('does not infer an offline state when the optional node status is absent', async () => {
    const fetcher: ProxmoxFetch = async (url) => {
      if (url.endsWith('/status')) return { ok: true, json: async () => ({ data: { cpu: 0.1 } }) };
      return { ok: true, json: async () => ({ data: [] }) };
    };
    const result = (await new ProxmoxAdapter([host], true, clock).read(fetcher))[0]!;
    expect(result.metadata).toMatchObject({ freshness: 'CURRENT', severity: 'OK' });
  });

  it('does not request Proxmox when the integration is disabled', async () => {
    const fetcher: ProxmoxFetch = async () => { throw new Error('must not be called'); };
    const result = (await new ProxmoxAdapter([host], false, clock).read(fetcher))[0]!;
    expect(result.metadata.freshness).toBe('NOT_SUPPORTED');
  });

  it('maps both standalone hosts through the identical public summary schema', async () => {
    const fetcher: ProxmoxFetch = async (url) => {
      if (url.endsWith('/status')) return { ok: true, json: async () => ({ data: { cpu: 0.25, status: 'online' } }) };
      if (url.endsWith('/storage')) return { ok: true, json: async () => ({ data: [] }) };
      return { ok: true, json: async () => ({ data: [] }) };
    };
    const results = await new ProxmoxAdapter([host, pve02], true, clock).read(fetcher);
    expect(results.map(({ id, name, ...summary }) => [id, name, Object.keys(summary).sort()])).toEqual([
      ['pve-01', 'pve-01', expect.any(Array)],
      ['pve-02', 'pve-02', expect.any(Array)],
    ]);
    expect(Object.keys(results[0]!).sort()).toEqual(Object.keys(results[1]!).sort());
  });
});
