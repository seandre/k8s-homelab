import { describe, expect, it } from 'vitest';
import { AlertmanagerAdapter } from './alertmanager.js';

describe('Alertmanager adapter', () => {
  it('returns active allowlisted alert fields without exposing raw labels', async () => {
    const adapter = new AlertmanagerAdapter('http://alertmanager.monitoring.svc:9093', true);
    const alerts = await adapter.read(async () => ({ ok: true, json: async () => [{ fingerprint: 'abc123', startsAt: '2026-07-20T00:00:00.000Z', status: { state: 'active' }, labels: { alertname: 'NodePressure', severity: 'warning', instance: 'private-value' }, annotations: { summary: 'Node memory pressure.' } }, { fingerprint: 'watchdog', startsAt: '2026-07-20T00:00:00.000Z', status: { state: 'active' }, labels: { alertname: 'Watchdog', severity: 'none' } }] }));
    expect(alerts).toEqual([expect.objectContaining({ id: 'abc123', name: 'NodePressure', severity: 'WARN', summary: 'Node memory pressure.' })]);
    expect(JSON.stringify(alerts)).not.toContain('private-value');
    expect(alerts).toHaveLength(1);
  });
});
