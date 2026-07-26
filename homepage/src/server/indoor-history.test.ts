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
    expect(isIndoorHistoryAlias('airgradient_living_room.co2')).toBe(true);
    expect(isIndoorHistoryAlias('airgradient_living_room.serial')).toBe(false);
  });

  it.each([
    ['airgradient_living_room.temperature', 'indoor_airgradient_temperature_fahrenheit', '°F'],
    ['airgradient_living_room.humidity', 'indoor_airgradient_humidity_percent', '%'],
    ['airgradient_living_room.co2', 'indoor_airgradient_co2_ppm', 'ppm'],
    ['airgradient_living_room.pm25', 'indoor_airgradient_pm25_micrograms_m3', 'µg/m³'],
    ['airgradient_living_room.pm10', 'indoor_airgradient_pm10_micrograms_m3', 'µg/m³'],
    ['airgradient_living_room.tvoc_index', 'indoor_airgradient_tvoc_index', 'index'],
    ['airgradient_living_room.nox_index', 'indoor_airgradient_nox_index', 'index'],
  ] as const)('maps %s to its fixed metric for every supported window', async (alias, metric, unit) => {
    const urls: string[] = [];
    const adapter = new IndoorHistoryAdapter('http://prometheus.test:9090', async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'matrix', result: [{ values: [[1784908800, '22.5']] }] } }) };
    }, () => new Date('2026-07-24T12:00:00.000Z'));

    for (const window of ['1h', '3h', '6h', '24h', '7d', '30d'] as const) {
      const series = await adapter.read(alias, window);
      expect(series).toMatchObject({ metric: alias, unit, window });
    }
    const custom = await adapter.read(alias, 'custom', {
      start: new Date('2026-07-24T10:00:00.000Z'),
      end: new Date('2026-07-24T12:00:00.000Z'),
    });
    expect(custom).toMatchObject({ metric: alias, unit, window: 'custom' });
    expect(urls).toHaveLength(7);
    for (const url of urls) {
      expect(new URL(url).searchParams.get('query')).toBe(`{__name__="${metric}",job="home-assistant-indoor"}`);
      expect(url).not.toContain('sensor.');
    }
  });

  it('normalizes Prometheus temperature samples from Celsius to Fahrenheit', async () => {
    const adapter = new IndoorHistoryAdapter('http://prometheus.test:9090', async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { resultType: 'matrix', result: [{ values: [[1784908800, '-5.2'], [1784908860, '22.5'], [1784908920, '24.9']] }] },
      }),
    }));
    const series = await adapter.read('aranet_living_room.temperature', '1h');
    expect(series).toMatchObject({
      unit: '°F',
      points: [{ value: 72.5 }, { value: 76.82 }],
    });
  });

  it('queries exact custom ranges with a bounded dynamic sample step', async () => {
    let requestedUrl = '';
    const adapter = new IndoorHistoryAdapter('http://prometheus.test:9090', async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'matrix', result: [] } }) };
    });
    const series = await adapter.read('aranet_living_room.co2', 'custom', {
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-07-01T00:00:00.000Z'),
    });
    const query = new URL(requestedUrl).searchParams;
    expect(query.get('start')).toBe(String(Date.parse('2026-01-01T00:00:00.000Z') / 1000));
    expect(query.get('end')).toBe(String(Date.parse('2026-07-01T00:00:00.000Z') / 1000));
    expect(Number(query.get('step'))).toBeGreaterThan(43_000);
    expect(series).toMatchObject({ window: 'custom', points: [] });
    await expect(adapter.read('aranet_living_room.co2', 'custom')).resolves.toBeNull();
  });
});
