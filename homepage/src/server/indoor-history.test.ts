import { describe, expect, it } from 'vitest';
import { IndoorHistoryAdapter, isIndoorHistoryAlias } from './indoor-history.js';

describe('indoor history adapter', () => {
  it('maps aliases and windows to a fixed query catalog', async () => {
    const urls: string[] = [];
    const adapter = new IndoorHistoryAdapter('http://prometheus.test:9090', async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'matrix', result: [{ values: [[1784908800, '612']] }] } }) };
    }, () => new Date('2026-07-24T12:00:00.000Z'));
    const series = await adapter.read('aranet_living_room.co2', '24h');
    expect(series).toMatchObject({ metric: 'aranet_living_room.co2', unit: 'ppm', window: '24h', points: [{ value: 612 }] });
    const query = new URL(urls[0]!).searchParams;
    expect(query.get('query')).toBe('{__name__="indoor_aranet_co2_ppm",job="home-assistant-indoor"}');
    expect(query.get('step')).toBe('300');
  });

  it('rejects arbitrary aliases before any Prometheus request can be formed', () => {
    expect(isIndoorHistoryAlias('up')).toBe(false);
    expect(isIndoorHistoryAlias('sensor.indoor_aranet_co2')).toBe(false);
    expect(isIndoorHistoryAlias('aranet_living_room.co2')).toBe(true);
  });
});
