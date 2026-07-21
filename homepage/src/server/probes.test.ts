import { describe, expect, it } from 'vitest';
import { AllowlistedProbeRunner, ProbeTargetNotAllowedError, type ProbeFetch } from './probes.js';
import { gitOwnedRuntimeConfig } from './runtime-config.js';
import type { Clock } from './normalization.js';

function fakeClock(): Clock & { advance(ms: number): void } { let now = new Date('2026-07-19T12:00:00.000Z'); return { now: () => now, advance: (ms) => { now = new Date(now.getTime() + ms); } }; }
function enabledConfig() { return { ...gitOwnedRuntimeConfig, featureFlags: { ...gitOwnedRuntimeConfig.featureFlags, probes: true }, sources: gitOwnedRuntimeConfig.sources.map((source) => source.id === 'service-probes' ? { ...source, enabled: true } : source) }; }

describe('allowlisted reachability probes', () => {
  it('uses only configured targets and requires two failures/two successes for state transitions', async () => {
    const clock = fakeClock(); let healthy = true; const requests: Array<{ url: string; method: string; redirect: string }> = [];
    const fetcher: ProbeFetch = async (url, init) => { requests.push({ url, method: init.method, redirect: init.redirect }); return { ok: healthy, status: healthy ? 200 : 503 }; };
    const runner = new AllowlistedProbeRunner(enabledConfig(), fetcher, clock);
    expect(await runner.run('argocd-probe')).toMatchObject({ status: 'UP', metadata: { freshness: 'CURRENT' } });
    healthy = false; expect((await runner.run('argocd-probe')).status).toBe('UP');
    expect((await runner.run('argocd-probe')).status).toBe('DEGRADED');
    healthy = true; clock.advance(15_000); expect((await runner.run('argocd-probe')).status).toBe('DEGRADED');
    expect((await runner.run('argocd-probe')).status).toBe('UP');
    expect(requests).toEqual(expect.arrayContaining([{ url: 'http://argocd-server.argocd.svc', method: 'HEAD', redirect: 'manual' }]));
    await expect(runner.run('https://example.com')).rejects.toBeInstanceOf(ProbeTargetNotAllowedError);
  });

  it('treats redirects and authentication responses as reachable without following them', async () => {
    for (const status of [302, 401, 403, 404]) {
      const runner = new AllowlistedProbeRunner(enabledConfig(), async () => ({ ok: false, status }), fakeClock());
      await expect(runner.run('argocd-probe')).resolves.toMatchObject({ status: 'UP', latencyMs: 0 });
    }
  });

  it('falls back to GET when an endpoint does not implement HEAD', async () => {
    const methods: string[] = [];
    const runner = new AllowlistedProbeRunner(enabledConfig(), async (_url, init) => {
      methods.push(init.method);
      return init.method === 'HEAD' ? { ok: false, status: 501 } : { ok: true, status: 200 };
    }, fakeClock());

    await expect(runner.run('pve-01-link-probe')).resolves.toMatchObject({ status: 'UP' });
    expect(methods).toEqual(['HEAD', 'GET']);
  });

  it('does not issue requests while the probe feature is disabled', async () => {
    const fetcher: ProbeFetch = async () => { throw new Error('must not be called'); };
    const disabled = { ...gitOwnedRuntimeConfig, featureFlags: { ...gitOwnedRuntimeConfig.featureFlags, probes: false } };
    const result = await new AllowlistedProbeRunner(disabled, fetcher, fakeClock()).run('argocd-probe');
    expect(result).toMatchObject({ status: 'DOWN', metadata: { freshness: 'NOT_SUPPORTED' } });
  });
});
