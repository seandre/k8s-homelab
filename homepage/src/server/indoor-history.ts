import { z } from 'zod';
import type { TimeSeries } from '../shared/contracts.js';

export type IndoorHistoryWindow = '1h' | '24h' | '7d' | '30d';
export const INDOOR_HISTORY_WINDOWS = ['1h', '24h', '7d', '30d'] as const;

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
} as const;
const windows = {
  '1h': { seconds: 3_600, step: '60' }, '24h': { seconds: 86_400, step: '300' },
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

export class IndoorHistoryAdapter {
  constructor(private readonly server: string, private readonly fetcher: IndoorHistoryFetch, private readonly now: () => Date = () => new Date()) {}

  async read(alias: IndoorHistoryAlias, window: IndoorHistoryWindow): Promise<TimeSeries | null> {
    const [metric, unit] = catalog[alias];
    const end = Math.floor(this.now().getTime() / 1_000);
    const endpoint = new URL(`${this.server.replace(/\/$/, '')}/api/v1/query_range`);
    endpoint.searchParams.set('query', `{__name__="${metric}",job="home-assistant-indoor"}`);
    endpoint.searchParams.set('start', String(end - windows[window].seconds));
    endpoint.searchParams.set('end', String(end));
    endpoint.searchParams.set('step', windows[window].step);
    try {
      const response = await this.fetcher(endpoint.toString());
      if (!response.ok) return null;
      const parsed = ResponseSchema.parse(await response.json());
      const values = parsed.data.result[0]?.values ?? [];
      return {
        metric: alias, unit, window,
        points: values.map(([timestamp, value]) => ({ timestamp: new Date(timestamp * 1_000).toISOString(), value: Number(value) })).filter((point) => Number.isFinite(point.value)).slice(-360),
        metadata: {
          source: 'prometheus-indoor-history', observedAt: this.now().toISOString(),
          freshness: values.length ? 'CURRENT' : 'NO_DATA', severity: values.length ? 'OK' : 'INFO',
          ...(!values.length ? { message: 'No retained samples are available for this window.' } : {}),
        },
      };
    } catch {
      return null;
    }
  }
}
