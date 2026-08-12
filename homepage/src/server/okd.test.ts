import { describe, expect, it, vi } from 'vitest';
import { OkdAdapter, normalizeOkdNodeName, normalizeOkdServer, parseKubernetesQuantity, type OkdReadClient } from './okd.js';
import type { Clock } from './normalization.js';

const nodes = { items: [
  { metadata: { name: 'OKD-CP-01.okd.lab.seandre.dev.' }, status: { conditions: [{ type: 'Ready', status: 'True' }], capacity: { cpu: '6', memory: '32Gi' } } },
  { metadata: { name: 'okd-cp-02' }, status: { conditions: [{ type: 'Ready', status: 'False', message: 'credential=private' }], capacity: { cpu: '6000m', memory: '64Gi' } } },
] };
const metrics = { items: [
  { metadata: { name: 'okd-cp-01' }, usage: { cpu: '900m', memory: '8Gi' } },
  { metadata: { name: 'okd-cp-02.okd.lab.seandre.dev' }, usage: { cpu: '1200000000n', memory: '16Gi' } },
] };
const deployments = { items: [
  { metadata: { name: 'console', namespace: 'openshift-console' }, spec: { replicas: 2 }, status: { readyReplicas: 2 } },
  { metadata: { name: 'broken', namespace: 'apps' }, spec: { replicas: 1 }, status: { readyReplicas: 0 } },
] };
const operators = { items: [
  { metadata: { name: 'ingress' }, status: { versions: [{ name: 'operator', version: '4.22.0' }], conditions: [{ type: 'Available', status: 'True' }, { type: 'Progressing', status: 'False' }, { type: 'Degraded', status: 'False' }] } },
  { metadata: { name: 'storage' }, status: { conditions: [{ type: 'Available', status: 'True' }, { type: 'Progressing', status: 'False' }, { type: 'Degraded', status: 'True', message: 'token=do-not-leak' }] } },
] };
const empty = { items: [] };

class MutableClock implements Clock {
  constructor(public value = new Date('2026-08-11T12:00:00.000Z')) {}
  now = () => this.value;
  advance(ms: number) { this.value = new Date(this.value.getTime() + ms); }
}

function client(overrides: Partial<OkdReadClient> = {}): OkdReadClient {
  return {
    listNodes: async () => nodes,
    listNodeMetrics: async () => metrics,
    listDeployments: async () => deployments,
    listStatefulSets: async () => empty,
    listDaemonSets: async () => empty,
    listClusterOperators: async () => operators,
    ...overrides,
  };
}

describe('OKD read-only adapter', () => {
  it('parses quantities and normalizes approved names and server URLs', () => {
    expect(parseKubernetesQuantity('250000000n', 'cpu')).toBe(0.25);
    expect(parseKubernetesQuantity('750m', 'cpu')).toBe(0.75);
    expect(parseKubernetesQuantity('1.5Gi', 'memory')).toBe(1.5 * 1024 ** 3);
    expect(parseKubernetesQuantity('secret', 'memory')).toBeNull();
    expect(normalizeOkdNodeName('OKD-CP-01.okd.lab.seandre.dev.')).toBe('okd-cp-01');
    expect(normalizeOkdServer('https://api.okd.lab.seandre.dev:6443')).toBe('https://api.okd.lab.seandre.dev:6443');
    expect(() => normalizeOkdServer('https://192.168.40.29:6443')).toThrow('approved strict-TLS');
    expect(() => normalizeOkdServer('http://api.okd.lab.seandre.dev:6443')).toThrow('approved strict-TLS');
  });

  it('normalizes totals, readiness, operators, and cluster-qualified workload IDs', async () => {
    const snapshot = await new OkdAdapter(client(), new MutableClock()).read();
    expect(snapshot.cluster).toMatchObject({ nodeCount: 2, readyNodeCount: 1, workloadCount: 2, cpuCapacityCores: 12, cpuUsedCores: 2.1, memoryCapacityBytes: 96 * 1024 ** 3, memoryUsedBytes: 24 * 1024 ** 3, metadata: { severity: 'CRIT' } });
    expect(snapshot.hosts[0]).toMatchObject({ id: 'okd:node:okd-cp-01', name: 'okd-cp-01', cpuPercent: 15, memoryPercent: 25, metadata: { severity: 'OK' } });
    expect(snapshot.hosts[1]?.metadata).toMatchObject({ severity: 'CRIT', message: 'Node is not Ready.' });
    expect(snapshot.workloads.find((item) => item.name === 'broken')).toMatchObject({ id: 'okd:deployment:apps:broken', metadata: { severity: 'WARN', message: 'Workload is not fully ready.' } });
    expect(snapshot.platformOperators.find((item) => item.name === 'ingress')).toMatchObject({ version: '4.22.0', available: true, progressing: false, degraded: false, metadata: { severity: 'OK' } });
    expect(snapshot.platformOperators.find((item) => item.name === 'storage')).toMatchObject({ version: null, degraded: true, metadata: { severity: 'CRIT', message: 'Operator reports a degraded condition.' } });
    expect(JSON.stringify(snapshot)).not.toMatch(/credential=private|token=do-not-leak|conditions|versions/);
  });

  it('rate-limits polling, retains last-good data, and requires two successes after circuit recovery', async () => {
    const clock = new MutableClock();
    let fail = false;
    const healthyNodes = { items: [nodes.items[0]] };
    const healthyMetrics = { items: [metrics.items[0]] };
    const healthyOperators = { items: [operators.items[0]] };
    const listNodes = vi.fn(async () => { if (fail) throw new Error('401 authorization=Bearer secret'); return healthyNodes; });
    const adapter = new OkdAdapter(client({ listNodes, listNodeMetrics: async () => healthyMetrics, listClusterOperators: async () => healthyOperators, listDeployments: async () => empty }), clock);
    expect((await adapter.read()).cluster.metadata.freshness).toBe('CURRENT');
    await adapter.read();
    expect(listNodes).toHaveBeenCalledTimes(1);
    fail = true;
    clock.advance(15_000);
    const stale = await adapter.read();
    expect(stale.cluster.metadata).toMatchObject({ freshness: 'STALE', severity: 'WARN' });
    expect(stale.hosts[0]?.metadata).toMatchObject({ freshness: 'STALE', severity: 'OK' });
    expect(stale.platformOperators[0]?.metadata).toMatchObject({ freshness: 'STALE', severity: 'OK' });
    clock.advance(15_000); expect((await adapter.read()).cluster.metadata.freshness).toBe('STALE');
    fail = false;
    clock.advance(15_000); expect((await adapter.read()).cluster.metadata).toMatchObject({ freshness: 'STALE', severity: 'WARN' });
    clock.advance(15_000); expect((await adapter.read()).cluster.metadata.freshness).toBe('CURRENT');
    expect(JSON.stringify(await adapter.read())).not.toContain('secret');
  });

  it('returns configured WARN/no-data for authentication failures and times out safely', async () => {
    const denied = new OkdAdapter(client({ listNodes: async () => { throw new Error('403 token=secret'); } }), new MutableClock());
    expect(await denied.read()).toMatchObject({ cluster: { nodeCount: null, metadata: { freshness: 'NO_DATA', severity: 'WARN', message: 'No successful OKD API sample is available.' } }, hosts: [], workloads: [], platformOperators: [] });

    const hanging = new OkdAdapter(client({ listNodes: () => new Promise(() => undefined) }), new MutableClock(), 1);
    const result = await hanging.read();
    expect(result.cluster.metadata).toMatchObject({ freshness: 'NO_DATA', severity: 'WARN' });
  });
});
