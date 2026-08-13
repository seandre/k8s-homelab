import { describe, expect, it } from 'vitest';
import { GLANCES_TIMEOUT_MS } from './glances.js';
import { LiveTelemetry, POLL_INTERVAL_MS } from './live-telemetry.js';
import { gitOwnedRuntimeConfig } from './runtime-config.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';

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

  it('records Kubernetes node and aggregate utilization history', async () => {
    const telemetry = new LiveTelemetry(
      runtimeConfig,
      () => undefined,
      async () => null,
      async (url) => url.includes('192.168.40')
        ? { ok: true, json: async () => ({ cpu: { total: 42 }, mem: { percent: 58, used: 58, total: 100 } }) }
        : { ok: true, json: async () => ({ data: [] }) },
    );
    const hosts = healthyBootstrapFixture.hosts.filter((host) => host.kind === 'K3S_NODE');
    const cluster = healthyBootstrapFixture.clusters.find((candidate) => candidate.platform === 'K3S')!;
    (telemetry as unknown as { k3s: { read(): Promise<{ hosts: typeof hosts; cluster: typeof cluster; workloads: [] }> } }).k3s = {
      read: async () => ({ hosts, cluster, workloads: [] }),
    };
    const okdHosts = healthyBootstrapFixture.hosts.filter((host) => host.kind === 'OKD_NODE');
    const okdCluster = healthyBootstrapFixture.clusters.find((candidate) => candidate.platform === 'OKD')!;
    const okdWorkloads = healthyBootstrapFixture.workloads.filter((workload) => workload.clusterId === 'okd');
    const platformOperators = healthyBootstrapFixture.platformOperators;
    (telemetry as unknown as { okd: { read(): Promise<{ hosts: typeof okdHosts; cluster: typeof okdCluster; workloads: typeof okdWorkloads; platformOperators: typeof platformOperators }> } }).okd = {
      read: async () => ({ hosts: okdHosts, cluster: okdCluster, workloads: okdWorkloads, platformOperators }),
    };

    await telemetry.refresh();
    await (telemetry as unknown as { refreshGraphTelemetry(): Promise<void> }).refreshGraphTelemetry();

    const series = telemetry.bootstrap().timeSeries;
    expect(series.find((candidate) => candidate.metric === 'k3s-worker-01 CPU')?.points).toHaveLength(2);
    expect(series.find((candidate) => candidate.metric === 'k3s-worker-01 MEMORY')?.points).toHaveLength(2);
    expect(series.find((candidate) => candidate.metric === 'k3s CPU')?.points).toHaveLength(2);
    expect(series.find((candidate) => candidate.metric === 'k3s MEMORY')?.points).toHaveLength(2);
    expect(series.find((candidate) => candidate.metric === 'okd-cp-01 CPU')?.points).toHaveLength(2);
    expect(series.find((candidate) => candidate.metric === 'okd MEMORY')?.points).toHaveLength(2);
    expect(telemetry.bootstrap().platformOperators).toEqual(platformOperators);
  });

  it('merges fixed OKD monitoring and per-outlet power into node cards and history', async () => {
    const telemetry = new LiveTelemetry(
      runtimeConfig,
      () => undefined,
      async (path) => path.endsWith('/okd/token') ? 'redacted-token' : null,
      async (url) => {
        const query = new URL(url).searchParams.get('query') ?? '';
        const power = query.includes('outlet_name="okd-cp-01"') ? 21.7
          : query.includes('outlet_name="okd-cp-02"') ? 27.2
            : query.includes('outlet_name="okd-cp-03"') ? 21.8
              : query.includes('outlet_name="pve-01"') ? 82
                : query.includes('outlet_name="pve-02"') ? 0 : 152.7;
        return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [{ value: [0, String(power)] }] } }) };
      },
    );
    const okdHosts = healthyBootstrapFixture.hosts.filter((host) => host.kind === 'OKD_NODE').map((host) => ({ ...host, powerWatts: null, loadAverage: null, cpuCorePercentages: null }));
    const okdCluster = healthyBootstrapFixture.clusters.find((candidate) => candidate.platform === 'OKD')!;
    const okdWorkloads = healthyBootstrapFixture.workloads.filter((workload) => workload.clusterId === 'okd');
    const platformOperators = healthyBootstrapFixture.platformOperators;
    (telemetry as unknown as { okd: { read(): Promise<{ hosts: typeof okdHosts; cluster: typeof okdCluster; workloads: typeof okdWorkloads; platformOperators: typeof platformOperators }> } }).okd = {
      read: async () => ({ hosts: okdHosts, cluster: okdCluster, workloads: okdWorkloads, platformOperators }),
    };
    (telemetry as unknown as { okdMonitoring: { read(): Promise<{ value: Map<string, { loadAverage: [number, number, number]; cpuCorePercentages: number[] }>; metadata: object; circuit: string; consecutiveFailures: number; consecutiveSuccesses: number }> } }).okdMonitoring = {
      read: async () => ({
        value: new Map(okdHosts.map((host, nodeIndex) => [host.name, { loadAverage: [0.5 + nodeIndex, 0.4 + nodeIndex, 0.3 + nodeIndex], cpuCorePercentages: Array.from({ length: 12 }, (_, core) => core + nodeIndex) }])),
        metadata: {}, circuit: 'CLOSED', consecutiveFailures: 0, consecutiveSuccesses: 0,
      }),
    };

    await telemetry.refresh();

    const host = telemetry.bootstrap().hosts.find((candidate) => candidate.name === 'okd-cp-01')!;
    expect(host).toMatchObject({ powerWatts: 21.7, loadAverage: [0.5, 0.4, 0.3], cpuCorePercentages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
    expect(telemetry.bootstrap().timeSeries.find((series) => series.metric === 'okd-cp-01 CORE 11')?.points).toEqual([{ timestamp: expect.any(String), value: 11 }]);
  });
});
