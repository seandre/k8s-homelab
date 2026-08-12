import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { buildOverviewModel, bytesToGiB, bytesToTiB } from './overview.js';

describe('Overview fixture model', () => {
  it('keeps matching Proxmox hosts and all supported summaries visible', () => {
    const model = buildOverviewModel(healthyBootstrapFixture);
    expect(model.proxmoxHosts.map((host) => host.name)).toEqual(['pve-01', 'pve-02']);
    expect(model.k3sNodes).toHaveLength(3);
    expect(model.okdNodes).toHaveLength(3);
    expect(model.proxmoxHosts.map((host) => host.memoryTotalBytes)).toEqual([17_179_869_184, 17_179_869_184]);
    expect(model.network.ingressVip).toBe('192.168.40.30');
    expect(model.network.gatewayLatencyProtocol).toBe('ICMP');
    expect(model.network.lastSpeedTest.metadata.freshness).toBe('STALE');
    expect(model.services).toHaveLength(18);
  });

  it('includes the active OKD cluster in the balanced health model', () => {
    const model = buildOverviewModel(healthyBootstrapFixture);
    expect(model.globalSeverity).toBe('WARN');
    expect(model.okd?.metadata.freshness).toBe('CURRENT');
    expect(model.okd?.metadata.severity).toBe('OK');
  });

  it('formats fixture capacities consistently', () => {
    expect(bytesToGiB(17_179_869_184)).toBe('16.0');
    expect(bytesToTiB(2_199_023_255_552)).toBe('2.00');
  });
});
