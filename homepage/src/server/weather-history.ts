import { z } from 'zod';
import type { TimeSeries } from '../shared/contracts.js';
import { INDOOR_HISTORY_WINDOWS, type IndoorHistoryRange, type IndoorHistoryWindow } from './indoor-history.js';

const catalog = {
  'outdoor.us_aqi': ['air', 'us_aqi', 'AQI'],
  'outdoor.pm25': ['air', 'pm2_5', 'µg/m³'],
  'outdoor.pm10': ['air', 'pm10', 'µg/m³'],
  'outdoor.temperature': ['weather', 'temperature_2m', '°F'],
  'outdoor.humidity': ['weather', 'relative_humidity_2m', '%'],
  'outdoor.precipitation': ['weather', 'precipitation', 'in'],
  'outdoor.wind_speed': ['weather', 'wind_speed_10m', 'mph'],
} as const;
const windowSeconds = { '1h': 3_600, '3h': 10_800, '6h': 21_600, '24h': 86_400, '7d': 604_800, '30d': 2_592_000 } as const;
const HourlySchema = z.object({
  time: z.array(z.number()),
  us_aqi: z.array(z.number().nullable()).optional(),
  pm2_5: z.array(z.number().nullable()).optional(),
  pm10: z.array(z.number().nullable()).optional(),
  temperature_2m: z.array(z.number().nullable()).optional(),
  relative_humidity_2m: z.array(z.number().nullable()).optional(),
  precipitation: z.array(z.number().nullable()).optional(),
  wind_speed_10m: z.array(z.number().nullable()).optional(),
});
const ResponseSchema = z.object({ hourly: HourlySchema });

export type WeatherHistoryAlias = keyof typeof catalog;
export type WeatherHistoryFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function isWeatherHistoryAlias(value: string): value is WeatherHistoryAlias {
  return Object.hasOwn(catalog, value);
}

export class WeatherHistoryAdapter {
  private readonly pending = new Map<string, Promise<z.infer<typeof HourlySchema> | null>>();

  constructor(private readonly latitude: number, private readonly longitude: number, private readonly fetcher: WeatherHistoryFetch, private readonly now: () => Date = () => new Date()) {}

  private load(kind: 'air' | 'weather', pastDays: number) {
    const key = `${kind}:${pastDays}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = (async () => {
      const endpoint = new URL(kind === 'air' ? 'https://air-quality-api.open-meteo.com/v1/air-quality' : 'https://api.open-meteo.com/v1/forecast');
      endpoint.searchParams.set('latitude', String(this.latitude));
      endpoint.searchParams.set('longitude', String(this.longitude));
      endpoint.searchParams.set('hourly', kind === 'air' ? 'us_aqi,pm2_5,pm10' : 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m');
      endpoint.searchParams.set('past_days', String(pastDays));
      endpoint.searchParams.set('forecast_days', '1');
      endpoint.searchParams.set('timeformat', 'unixtime');
      if (kind === 'weather') {
        endpoint.searchParams.set('temperature_unit', 'fahrenheit');
        endpoint.searchParams.set('wind_speed_unit', 'mph');
        endpoint.searchParams.set('precipitation_unit', 'inch');
      }
      try {
        const response = await this.fetcher(endpoint.toString());
        if (!response.ok) return null;
        return ResponseSchema.parse(await response.json()).hourly;
      } catch { return null; }
    })().finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  async read(alias: WeatherHistoryAlias, window: IndoorHistoryWindow | 'custom', range?: IndoorHistoryRange): Promise<TimeSeries | null> {
    if (window === 'custom' && !range) return null;
    const end = range?.end ?? this.now();
    const start = range?.start ?? new Date(end.getTime() - windowSeconds[window as IndoorHistoryWindow] * 1_000);
    const spanDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (spanDays > 92 || spanDays < 1) return null;
    const [kind, field, unit] = catalog[alias];
    const hourly = await this.load(kind, spanDays);
    const values = hourly?.[field];
    if (!hourly || !values) return null;
    const points = hourly.time.flatMap((timestamp, index) => {
      const value = values[index];
      const instant = timestamp * 1_000;
      return value === null || value === undefined || instant < start.getTime() || instant > end.getTime() ? [] : [{ timestamp: new Date(instant).toISOString(), value }];
    });
    const stride = Math.max(1, Math.ceil(points.length / 360));
    const sampled = points.filter((_, index) => index % stride === 0 || index === points.length - 1).slice(-360);
    return {
      metric: alias, unit, window, points: sampled,
      metadata: {
        source: 'open-meteo-outdoor-history', observedAt: this.now().toISOString(),
        freshness: sampled.length ? 'CURRENT' : 'NO_DATA', severity: sampled.length ? 'OK' : 'INFO',
        ...(!sampled.length ? { message: 'No outdoor samples are available for this window.' } : {}),
      },
    };
  }
}

export { INDOOR_HISTORY_WINDOWS as WEATHER_HISTORY_WINDOWS };
