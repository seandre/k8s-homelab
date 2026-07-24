import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { IndoorActionGateway } from './indoor-actions.js';

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

  it('exposes only the fixed confirmed indoor action route with private-path and same-origin gates', async () => {
    const snapshot = structuredClone(healthyBootstrapFixture);
    snapshot.indoor.purifiers[0].sourceState = 'AVAILABLE';
    snapshot.indoor.purifiers[0].stateVersion = 'current-state';
    const execute = async () => { snapshot.indoor.purifiers[0].power = true; };
    const actions = new IndoorActionGateway(() => snapshot, { execute }, () => {}, () => new Date('2026-07-24T12:00:00Z'), async () => {}, 1, 10);
    const app = buildApp({ config, bootstrapProvider: () => snapshot, indoorActions: actions });
    const response = await app.inject({
      method: 'POST', url: '/api/v1/indoor/actions', remoteAddress: '192.168.20.42',
      headers: {
        host: 'homepage.lab.seandre.dev', origin: 'https://homepage.lab.seandre.dev',
        'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: '07aab38e-c720-45d7-8896-491bd165af4b', expectedStateVersion: 'current-state', confirmed: true,
        command: { type: 'COWAY_SET_POWER', target: 'coway_living_room', power: true },
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ data: { target: 'coway_living_room', status: 'PENDING' } });
    expect(response.body).not.toMatch(/entity_id|fan\.|service|token/i);

    const raw = await app.inject({
      method: 'POST', url: '/api/v1/indoor/actions', remoteAddress: '192.168.20.42',
      headers: {
        host: 'homepage.lab.seandre.dev', origin: 'https://homepage.lab.seandre.dev',
        'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'content-type': 'application/json',
      },
      payload: {
        idempotencyKey: '62194990-9b0c-4db1-ab26-d73157bb98f3', expectedStateVersion: 'current-state', confirmed: true,
        entity_id: 'fan.private', command: { type: 'COWAY_SET_POWER', target: 'coway_living_room', power: true },
      },
    });
    expect(raw.statusCode).toBe(400);
    expect(raw.body).not.toContain('fan.private');
    await app.close();
  });
});
