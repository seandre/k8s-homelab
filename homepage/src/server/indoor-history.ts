import { z } from 'zod';
import type { TimeSeries } from '../shared/contracts.js';

export type IndoorHistoryWindow = '1h' | '3h' | '6h' | '24h' | '7d' | '30d';
export const INDOOR_HISTORY_WINDOWS = ['1h', '3h', '6h', '24h', '7d', '30d'] as const;
export type IndoorHistoryRange = { start: Date; end: Date };

const catalog = {
  'aranet_living_room.temperature': ['indoor_aranet_temperature_fahrenheit', '°F'],
  'aranet_living_room.humidity': ['indoor_aranet_humidity_percent', '%'],
  'aranet_living_room.pressure': ['indoor_aranet_pressure_hpa', 'hPa'],
  'aranet_living_room.co2': ['indoor_aranet_co2_ppm', 'ppm'],
  'aranet_living_room.battery': ['indoor_aranet_battery_percent', '%'],
  'nest_living_room.current_temperature': ['indoor_nest_temperature_fahrenheit', '°F'],
  'nest_living_room.humidity': ['indoor_nest_humidity_percent', '%'],
  'coway_living_room.aqi': ['indoor_coway_living_room_aqi', '%'],
  'coway_living_room.pm25': ['indoor_coway_living_room_pm25_micrograms_m3', 'µg/m³'],
  'coway_living_room.pm10': ['indoor_coway_living_room_pm10_micrograms_m3', 'µg/m³'],
  'coway_living_room.filter_life': ['indoor_coway_living_room_filter_life_percent', '%'],
  'coway_bedroom.aqi': ['indoor_coway_bedroom_aqi', '%'],
  'coway_bedroom.pm25': ['indoor_coway_bedroom_pm25_micrograms_m3', 'µg/m³'],
  'coway_bedroom.pm10': ['indoor_coway_bedroom_pm10_micrograms_m3', 'µg/m³'],
  'coway_bedroom.filter_life': ['indoor_coway_bedroom_filter_life_percent', '%'],
  'airgradient_living_room.temperature': ['indoor_airgradient_temperature_fahrenheit', '°F'],
  'airgradient_living_room.humidity': ['indoor_airgradient_humidity_percent', '%'],
  'airgradient_living_room.co2': ['indoor_airgradient_co2_ppm', 'ppm'],
  'airgradient_living_room.pm25': ['indoor_airgradient_pm25_micrograms_m3', 'µg/m³'],
  'airgradient_living_room.pm10': ['indoor_airgradient_pm10_micrograms_m3', 'µg/m³'],
  'airgradient_living_room.tvoc_index': ['indoor_airgradient_tvoc_index', 'index'],
  'airgradient_living_room.nox_index': ['indoor_airgradient_nox_index', 'index'],
} as const;
const windows = {
  '1h': { seconds: 3_600, step: '60' }, '3h': { seconds: 10_800, step: '60' },
  '6h': { seconds: 21_600, step: '120' }, '24h': { seconds: 86_400, step: '300' },
  '7d': { seconds: 604_800, step: '1800' }, '30d': { seconds: 2_592_000, step: '7200' },
} as const;
const ResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    resultType: z.literal('matrix'),
    result: z.array(z.object({ values: z.array(z.tuple([z.number(), z.string()])) })).max(1),
  }),
});
export type IndoorHistoryAlias = keyof typeof catalog;
export type IndoorHistoryFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function isIndoorHistoryAlias(value: string): value is IndoorHistoryAlias {
  return Object.hasOwn(catalog, value);
}

function normalizeHistoryValue(alias: IndoorHistoryAlias, rawValue: string) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;
  if (alias === 'aranet_living_room.temperature'
    || alias === 'nest_living_room.current_temperature'
    || alias === 'airgradient_living_room.temperature') {
    // Home Assistant's Prometheus exporter emits temperature samples in its
    // canonical Celsius unit even when override_metric contains "fahrenheit".
    const fahrenheit = value * 9 / 5 + 32;
    return fahrenheit >= 40 && fahrenheit <= 120 ? Number(fahrenheit.toFixed(2)) : null;
  }
  return value;
}

export class IndoorHistoryAdapter {
  constructor(private readonly server: string, private readonly fetcher: IndoorHistoryFetch, private readonly now: () => Date = () => new Date()) {}

  async read(alias: IndoorHistoryAlias, window: IndoorHistoryWindow | 'custom', range?: IndoorHistoryRange): Promise<TimeSeries | null> {
    if (window === 'custom' && !range) return null;
    const [metric, unit] = catalog[alias];
    const end = range ? Math.floor(range.end.getTime() / 1_000) : Math.floor(this.now().getTime() / 1_000);
    const start = range ? Math.floor(range.start.getTime() / 1_000) : end - windows[window as IndoorHistoryWindow].seconds;
    const step = range ? String(Math.max(60, Math.ceil((end - start) / 359))) : windows[window as IndoorHistoryWindow].step;
    const endpoint = new URL(`${this.server.replace(/\/$/, '')}/api/v1/query_range`);
    endpoint.searchParams.set('query', `{__name__="${metric}",job="home-assistant-indoor"}`);
    endpoint.searchParams.set('start', String(start));
    endpoint.searchParams.set('end', String(end));
    endpoint.searchParams.set('step', step);
    try {
      const response = await this.fetcher(endpoint.toString());
      if (!response.ok) return null;
      const parsed = ResponseSchema.parse(await response.json());
      const values = parsed.data.result[0]?.values ?? [];
      const points = values.flatMap(([timestamp, rawValue]) => {
        const value = normalizeHistoryValue(alias, rawValue);
        return value === null ? [] : [{ timestamp: new Date(timestamp * 1_000).toISOString(), value }];
      }).slice(-360);
      return {
        metric: alias, unit, window,
        points,
        metadata: {
          source: 'prometheus-indoor-history', observedAt: this.now().toISOString(),
          freshness: points.length ? 'CURRENT' : 'NO_DATA', severity: points.length ? 'OK' : 'INFO',
          ...(!points.length ? { message: 'No retained samples are available for this window.' } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
