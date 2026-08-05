import { describe, expect, it } from 'vitest';
import { isWeatherHistoryAlias, WeatherHistoryAdapter } from './weather-history.js';

const now = new Date('2026-08-04T12:00:00.000Z');
const hourly = {
  time: [now.getTime() / 1_000 - 7_200, now.getTime() / 1_000 - 3_600, now.getTime() / 1_000],
  us_aqi: [42, 55, 63], pm2_5: [8, 12, 18], pm10: [16, 25, 31],
  temperature_2m: [65, 66, 68], relative_humidity_2m: [58, 55, 52],
  precipitation: [0, 0.01, 0], wind_speed_10m: [4, 7, 5],
};

describe('weather history adapter', () => {
  it('uses fixed aliases and never accepts provider field names from callers', () => {
    expect(isWeatherHistoryAlias('outdoor.us_aqi')).toBe(true);
    expect(isWeatherHistoryAlias('outdoor.wind_speed')).toBe(true);
    expect(isWeatherHistoryAlias('temperature_2m')).toBe(false);
    expect(isWeatherHistoryAlias('outdoor.arbitrary')).toBe(false);
  });

  it('loads and maps air-quality history with bounded Open-Meteo parameters', async () => {
    const urls: string[] = [];
    const adapter = new WeatherHistoryAdapter(45.52, -122.68, async (url) => {
      urls.push(url);
      return { ok: true, json: async () => ({ hourly }) };
    }, () => now);
    const series = await adapter.read('outdoor.us_aqi', '3h');
    expect(series).toMatchObject({ metric: 'outdoor.us_aqi', unit: 'AQI', window: '3h', points: [{ value: 42 }, { value: 55 }, { value: 63 }] });
    const query = new URL(urls[0]!);
    expect(query.origin + query.pathname).toBe('https://air-quality-api.open-meteo.com/v1/air-quality');
    expect(query.searchParams.get('hourly')).toBe('us_aqi,pm2_5,pm10');
    expect(Number(query.searchParams.get('past_days'))).toBeLessThanOrEqual(92);
  });

  it('requests imperial weather units and rejects custom windows over 92 days', async () => {
    let requestedUrl = '';
    const adapter = new WeatherHistoryAdapter(45.52, -122.68, async (url) => {
      requestedUrl = url;
      return { ok: true, json: async () => ({ hourly }) };
    }, () => now);
    await expect(adapter.read('outdoor.temperature', '24h')).resolves.toMatchObject({ unit: '°F' });
    const query = new URL(requestedUrl).searchParams;
    expect(query.get('temperature_unit')).toBe('fahrenheit');
    expect(query.get('wind_speed_unit')).toBe('mph');
    expect(query.get('precipitation_unit')).toBe('inch');
    await expect(adapter.read('outdoor.humidity', 'custom', {
      start: new Date('2026-01-01T00:00:00.000Z'), end: now,
    })).resolves.toBeNull();
  });

  it('coalesces simultaneous metrics from the same provider request', async () => {
    let requests = 0;
    const adapter = new WeatherHistoryAdapter(45.52, -122.68, async () => {
      requests += 1;
      return { ok: true, json: async () => ({ hourly }) };
    }, () => now);
    await Promise.all([adapter.read('outdoor.pm25', '24h'), adapter.read('outdoor.pm10', '24h')]);
    expect(requests).toBe(1);
  });

  it('calculates EPA-compatible 24-hour particulate averages on the server', async () => {
    const time = Array.from({ length: 25 }, (_, index) => now.getTime() / 1_000 - (24 - index) * 3_600);
    const adapter = new WeatherHistoryAdapter(45.52, -122.68, async () => ({
      ok: true,
      json: async () => ({ hourly: {
        time, us_aqi: time.map(() => 80),
        pm2_5: time.map((_, index) => index === 24 ? 60 : 12.04),
        pm10: time.map((_, index) => index === 24 ? 200 : 50.9),
      } }),
    }), () => now);
    const [pm25, pm10] = await Promise.all([adapter.read('outdoor.pm25', '1h'), adapter.read('outdoor.pm10', '1h')]);
    expect(pm25?.points.at(-1)?.value).toBe(14);
    expect(pm10?.points.at(-1)?.value).toBe(57);
    expect(pm25?.metadata.source).toBe('open-meteo-outdoor-history');
  });
});
