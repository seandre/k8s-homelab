import { describe, expect, it } from 'vitest';
import { GLANCES_TIMEOUT_MS } from './glances.js';
import { LiveTelemetry, POLL_INTERVAL_MS } from './live-telemetry.js';
import { gitOwnedRuntimeConfig } from './runtime-config.js';

const runtimeConfig = {
  ...gitOwnedRuntimeConfig,
  featureFlags: { ...gitOwnedRuntimeConfig.featureFlags, proxmox: true },
};

describe('live telemetry', () => {
  it('uses a two-second graph polling cadence', () => {
    expect(POLL_INTERVAL_MS).toBe(2_000);
    expect(GLANCES_TIMEOUT_MS).toBeLessThan(POLL_INTERVAL_MS);
  });

  it('replaces fixture host identity and graph samples with normalized Proxmox and Glances values', async () => {
    const published: unknown[] = [];
    const secrets: Record<string, string> = {
      '/var/run/homepage-secrets/pve01/server': 'https://pve-01.example.test:8006/api2/json',
      '/var/run/homepage-secrets/pve01/token-id': 'homepage@pve!reader',
      '/var/run/homepage-secrets/pve01/token-secret': 'not-logged',
    };
    const telemetry = new LiveTelemetry(
      runtimeConfig,
      (bootstrap) => published.push(bootstrap),
      async (path) => secrets[path] ?? null,
      async (url) => {
        if (url.includes('192.168.40.20')) return { ok: true, json: async () => ({ cpu: { total: 42 }, percpu: [{ total: 38 }, { total: 46 }], mem: { percent: 58, used: 58, total: 100 }, fs: [{ mnt_point: '/', used: 40, size: 100 }], network: { vmbr0: { rx: 10, tx: 20 } }, uptime: 60 }) };
        if (url.includes('192.168.40.25')) return { ok: false, json: async () => ({}) };
        if (url.endsWith('/status')) return { ok: true, json: async () => ({ data: { cpu: 0.1, cpuinfo: { model: 'Intel(R) Core(TM) i5-10500T', mhz: '3539.2', cpus: 12 }, loadavg: ['0.42', '0.71', '0.66'], memory: { used: 50, total: 100 }, rootfs: { used: 10, total: 100 }, swap: { used: 1, total: 10 }, uptime: 60, status: 'online' } }) };
        if (url.endsWith('/cluster/resources')) return { ok: true, json: async () => ({ data: [] }) };
        return { ok: true, json: async () => ({ data: [] }) };
      },
    );

    await telemetry.start();
    telemetry.stop();

    const bootstrap = telemetry.bootstrap();
    const host = bootstrap.hosts.find((candidate) => candidate.id === 'pve-01')!;
    expect(host).toMatchObject({ cpuPercent: 42, memoryPercent: 58, cpuModel: 'Intel(R) Core(TM) i5-10500T · 12T', cpuClockMhz: 3539.2 });
    expect(bootstrap.timeSeries.find((series) => series.metric === 'pve-01 CPU')?.points).toHaveLength(1);
    expect(bootstrap.timeSeries.find((series) => series.metric === 'pve-01 CORE 0')?.points).toEqual([{ timestamp: expect.any(String), value: 38 }]);
    expect(published).toHaveLength(1);
  });

  it('records a new graph sample when consecutive polls return the same value', async () => {
    const telemetry = new LiveTelemetry(
      runtimeConfig,
      () => undefined,
      async () => null,
      async (url) => url.includes('192.168.40')
        ? { ok: true, json: async () => ({ cpu: { total: 42 }, mem: { percent: 58, used: 58, total: 100 } }) }
        : { ok: true, json: async () => ({ data: [] }) },
    );

    await telemetry.refresh();
    await telemetry.refresh();

    const points = telemetry.bootstrap().timeSeries.find((series) => series.metric === 'pve-01 CPU')?.points;
    expect(points).toHaveLength(2);
    expect(points?.map((point) => point.value)).toEqual([42, 42]);
    expect(points?.[0]?.timestamp).not.toBe(points?.[1]?.timestamp);
  });
});
