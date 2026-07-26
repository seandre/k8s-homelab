import { describe, expect, it } from 'vitest';
import { OpenMeteoAdapter, type FetchResponse, type SafeFetch, type WeatherDiagnostic } from './open-meteo.js';
import type { Clock } from './normalization.js';

function mutableClock() {
  let now = new Date('2026-07-19T12:00:00.000Z');
  return {
    clock: { now: () => now } satisfies Clock,
    advance(milliseconds: number) { now = new Date(now.getTime() + milliseconds); },
  };
}
function response(value: unknown, ok = true, status = ok ? 200 : 503): FetchResponse { return { ok, status, json: async () => value }; }

const points = { properties: { observationStations: 'https://api.weather.gov/gridpoints/PQR/112,103/stations', forecastHourly: 'https://api.weather.gov/gridpoints/PQR/112,103/forecast/hourly' } };
const stations = { features: [{ id: 'https://api.weather.gov/stations/KPDX' }] };
const observation = { properties: { timestamp: '2026-07-19T05:00:00-07:00', temperature: { value: 20 }, textDescription: 'Mostly Cloudy' } };
const forecast = { properties: { periods: [{ startTime: '2026-07-19T05:00:00-07:00', temperature: 67, temperatureUnit: 'F', shortForecast: 'Cloudy' }] } };
const conditions = { current: { time: 1_774_182_400, temperature_2m: 68, weather_code: 2 }, daily: { sunrise: [1_774_160_000], sunset: [1_774_210_000] } };
const air = { current: { time: 1_774_182_400, us_aqi: 24, pm2_5: 4.1, pm10: 12.3 } };
const airNow = [{ ParameterName: 'PM2.5', AQI: 31 }, { ParameterName: 'O3', AQI: 22 }];
const weatherApi = {
  location: { tz_id: 'America/Los_Angeles' },
  current: { last_updated_epoch: 1_774_182_400, temp_f: 69.4, condition: { text: 'Sunny' } },
  forecast: { forecastday: [{ date: '2026-07-19', astro: { sunrise: '05:39 AM', sunset: '08:53 PM' } }] },
};

function providerFetch(calls: Array<{ url: string; headers?: Record<string, string> }>, overrides: Partial<Record<'weatherapi' | 'points' | 'stations' | 'observation' | 'forecast' | 'conditions' | 'air' | 'airnow', FetchResponse>> = {}): SafeFetch {
  return async (url, init) => {
    calls.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
    if (url.includes('weatherapi.com')) return overrides.weatherapi ?? response(weatherApi);
    if (url.includes('/points/')) return overrides.points ?? response(points);
    if (url.endsWith('/stations')) return overrides.stations ?? response(stations);
    if (url.endsWith('/observations/latest')) return overrides.observation ?? response(observation);
    if (url.endsWith('/forecast/hourly')) return overrides.forecast ?? response(forecast);
    if (url.includes('airnowapi')) return overrides.airnow ?? response(airNow);
    if (url.includes('air-quality-api')) return overrides.air ?? response(air);
    return overrides.conditions ?? response(conditions);
  };
}

describe('weather provider chain', () => {
  it('uses WeatherAPI current conditions and astronomy when its key is configured', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const weather = await new OpenMeteoAdapter({
      fetch: providerFetch(calls),
      latitude: 45.527412,
      longitude: -122.686270,
      weatherApiKey: 'test-weather-key',
      enabled: true,
      clock: mutableClock().clock,
    }).read();
    expect(weather).toMatchObject({
      temperatureFahrenheit: 69.4,
      condition: 'Sunny',
      sunrise: '2026-07-19T12:39:00.000Z',
      sunset: '2026-07-20T03:53:00.000Z',
    });
    expect(weather.conditionsMetadata.source).toBe('weatherapi');
    expect(calls.some((call) => call.url.includes('api.weather.gov'))).toBe(false);
  });

  it('falls back to NWS when WeatherAPI rejects its request', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const weather = await new OpenMeteoAdapter({
      fetch: providerFetch(calls, { weatherapi: response({}, false, 503) }),
      latitude: 45.527412,
      longitude: -122.686270,
      weatherApiKey: 'test-weather-key',
      enabled: true,
      clock: mutableClock().clock,
      diagnostic: () => undefined,
    }).read();
    expect(weather.conditionsMetadata.source).toBe('nws-observation');
    expect(weather.temperatureFahrenheit).toBe(68);
  });

  it('uses NWS observations, AirNow AQI, and Open-Meteo PM/sun data', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const time = mutableClock();
    const weather = await new OpenMeteoAdapter({
      fetch: providerFetch(calls),
      latitude: 45.527412,
      longitude: -122.686270,
      airNowApiKey: 'test-key',
      enabled: true,
      clock: time.clock,
    }).read();

    expect(weather).toMatchObject({ location: 'Portland, OR 97209', temperatureFahrenheit: 68, condition: 'Mostly Cloudy', usAqi: 31, pm25: 4.1, pm10: 12.3 });
    expect(weather.conditionsMetadata.source).toBe('nws-observation');
    expect(weather.airQualityMetadata.source).toBe('airnow+open-meteo-pm');
    expect(calls.find((call) => call.url.includes('api.weather.gov'))?.headers?.['User-Agent']).toContain('home.lab.seandre.dev');
  });

  it('does not hit weather providers on each six-second dashboard refresh', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const time = mutableClock();
    const adapter = new OpenMeteoAdapter({ fetch: providerFetch(calls), latitude: 45.527412, longitude: -122.686270, enabled: true, clock: time.clock });
    await adapter.read();
    const initialCalls = calls.length;
    time.advance(6_000);
    await adapter.read();
    expect(calls).toHaveLength(initialCalls);
    time.advance(10 * 60_000);
    await adapter.read();
    expect(calls.length).toBeGreaterThan(initialCalls);
    expect(calls.filter((call) => call.url.includes('/points/'))).toHaveLength(1);
  });

  it('retries air quality promptly after a transient provider failure', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const time = mutableClock();
    let airAttempts = 0;
    const fetcher: SafeFetch = async (url, init) => {
      if (url.includes('air-quality-api')) {
        airAttempts += 1;
        return airAttempts === 1
          ? response({}, false, 503)
          : response({ current: { ...air.current, time: Math.floor(time.clock.now().getTime() / 1_000) } });
      }
      return providerFetch(calls)(url, init);
    };
    const adapter = new OpenMeteoAdapter({
      fetch: fetcher,
      latitude: 45.527412,
      longitude: -122.686270,
      enabled: true,
      clock: time.clock,
      diagnostic: () => undefined,
    });

    expect((await adapter.read()).airQualityMetadata.freshness).toBe('NO_DATA');
    time.advance(59_000);
    expect((await adapter.read()).airQualityMetadata.freshness).toBe('NO_DATA');
    expect(airAttempts).toBe(1);
    time.advance(1_000);
    expect((await adapter.read()).airQualityMetadata.freshness).toBe('CURRENT');
    expect(airAttempts).toBe(2);
  });

  it('treats a quality-controlled NWS observation under 35 minutes old as current', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const time = mutableClock();
    const adapter = new OpenMeteoAdapter({ fetch: providerFetch(calls), latitude: 45.527412, longitude: -122.686270, enabled: true, clock: time.clock });
    await adapter.read();
    time.advance(25 * 60_000);
    const weather = await adapter.read();
    expect(weather.conditionsMetadata.freshness).toBe('CURRENT');
  });

  it('falls back from a failed NWS observation to its hourly forecast', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const diagnostics: Parameters<WeatherDiagnostic>[0][] = [];
    const weather = await new OpenMeteoAdapter({
      fetch: providerFetch(calls, { observation: response({}, false, 503) }),
      latitude: 45.527412,
      longitude: -122.686270,
      enabled: true,
      clock: mutableClock().clock,
      diagnostic: (event) => diagnostics.push(event),
    }).read();
    expect(weather.temperatureFahrenheit).toBe(67);
    expect(weather.condition).toBe('Cloudy');
    expect(weather.conditionsMetadata.source).toBe('nws-hourly-forecast');
    expect(diagnostics).toContainEqual({ provider: 'nws', operation: 'latest observation', reason: 'HTTP 503' });
  });

  it('keeps NWS conditions current when Open-Meteo sunrise data is rate-limited', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const weather = await new OpenMeteoAdapter({
      fetch: providerFetch(calls, { conditions: response({}, false, 429) }),
      latitude: 45.527412,
      longitude: -122.686270,
      enabled: true,
      clock: mutableClock().clock,
      diagnostic: () => undefined,
    }).read();
    expect(weather).toMatchObject({ temperatureFahrenheit: 68, condition: 'Mostly Cloudy', sunrise: null, sunset: null });
    expect(weather.conditionsMetadata).toMatchObject({ source: 'nws-observation', freshness: 'CURRENT' });
  });

  it('uses Open-Meteo when NWS and an optional AirNow request fail', async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const weather = await new OpenMeteoAdapter({
      fetch: providerFetch(calls, { points: response({}, false, 503), airnow: response({}, false, 429) }),
      latitude: 45.527412,
      longitude: -122.686270,
      airNowApiKey: 'test-key',
      enabled: true,
      clock: mutableClock().clock,
      diagnostic: () => undefined,
    }).read();
    expect(weather).toMatchObject({ temperatureFahrenheit: 68, condition: 'Partly cloudy', usAqi: 24 });
    expect(weather.conditionsMetadata.source).toBe('open-meteo-fallback');
    expect(weather.airQualityMetadata.source).toBe('open-meteo-fallback');
  });

  it('does not call upstream when the feature is disabled', async () => {
    const fetcher: SafeFetch = async () => { throw new Error('must not be called'); };
    const weather = await new OpenMeteoAdapter({ fetch: fetcher, latitude: 45.527412, longitude: -122.686270, enabled: false, clock: mutableClock().clock }).read();
    expect(weather.conditionsMetadata.freshness).toBe('NOT_SUPPORTED');
    expect(weather.airQualityMetadata.freshness).toBe('NOT_SUPPORTED');
  });
});
