import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';

const config = loadConfig({ NODE_ENV: 'test' });

describe('backend shell', () => {
  it('serves liveness and readiness', async () => {
    const app = buildApp({ config });
    await expect(app.inject({ method: 'GET', url: '/api/health/live' })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.inject({ method: 'GET', url: '/api/health/ready' })).resolves.toMatchObject({ statusCode: 200 });
    await app.close();
  });

  it('reports not ready without exposing internals', async () => {
    const app = buildApp({ config, ready: () => false });
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not_ready' });
    await app.close();
  });

  it('returns the validated fixture-backed bootstrap contract', async () => {
    const app = buildApp({ config });
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
      headers: { 'x-request-id': 'test-request-id' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: healthyBootstrapFixture, requestId: 'test-request-id' });
    await app.close();
  });

  it('serves only allowlisted fixture history windows', async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: 'GET', url: '/api/v1/history?metric=pve-01%20CPU&window=15m' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { metric: 'pve-01 CPU', window: '15m' } });
    await expect(app.inject({ method: 'GET', url: '/api/v1/history?metric=up&window=15m' })).resolves.toMatchObject({ statusCode: 404 });
    await expect(app.inject({ method: 'GET', url: '/api/v1/history?metric=pve-01%20CPU&window=2h' })).resolves.toMatchObject({ statusCode: 400 });
    await app.close();
  });

  it('serves indoor history through the fixed server-side adapter', async () => {
    const app = buildApp({
      config,
      indoorHistory: {
        read: async (metric, window) => ({
          metric, window, unit: 'ppm', points: [{ timestamp: '2026-07-24T12:00:00.000Z', value: 612 }],
          metadata: { source: 'prometheus-indoor-history', observedAt: '2026-07-24T12:00:00.000Z', freshness: 'CURRENT', severity: 'OK' },
        }),
      },
    });
    const response = await app.inject({ method: 'GET', url: '/api/v1/history?metric=aranet_living_room.co2&window=30d' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { metric: 'aranet_living_room.co2', window: '30d' } });
    await expect(app.inject({ method: 'GET', url: '/api/v1/history?metric=sensor.indoor_aranet_co2&window=30d' })).resolves.toMatchObject({ statusCode: 404 });
    await app.close();
  });

  it('returns a safe internal error when bootstrap initialization fails', async () => {
    const app = buildApp({ config, bootstrapProvider: () => { throw new Error('token=do-not-return'); } });
    const response = await app.inject({ method: 'GET', url: '/api/v1/bootstrap' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('token');
    expect(response.body).not.toContain('do-not-return');
    await app.close();
  });
});
