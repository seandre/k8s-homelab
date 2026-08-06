import { z } from 'zod';
import type { SafeFetch } from './open-meteo.js';

const CurrentSchema = z.object({ time: z.number(), us_aqi: z.number().nullable(), pm2_5: z.number().nullable(), pm10: z.number().nullable() });
const ModelSchema = z.union([
  z.object({ latitude: z.number(), longitude: z.number(), current: CurrentSchema }),
  z.array(z.object({ latitude: z.number(), longitude: z.number(), current: CurrentSchema })),
]);
const DetailSchema = z.object({
  latitude: z.number(), longitude: z.number(), current: CurrentSchema,
  hourly: z.object({ time: z.array(z.number()), us_aqi: z.array(z.number().nullable()) }),
});
const StationSchema = z.array(z.object({
  Latitude: z.number(), Longitude: z.number(), AQI: z.number().nullable().optional(),
  RawConcentration: z.number().nullable().optional(), Parameter: z.string().optional(), ParameterName: z.string().optional(),
  SiteName: z.string().optional(), ReportingArea: z.string().optional(), UTC: z.string().optional(), DateObserved: z.string().optional(), HourObserved: z.number().optional(),
}).passthrough());

export type AirPoint = { id: string; latitude: number; longitude: number; usAqi: number | null; pm25: number | null; pm10: number | null; category: string; observedAt: string; source: string; siteName?: string };
export type AirMapData = { modelPoints: AirPoint[]; stations: AirPoint[]; stationStatus: 'CURRENT' | 'UNAVAILABLE' };
export type AirDetail = AirPoint & { forecast: { at: string; usAqi: number | null }[] };

export function aqiCategory(aqi: number | null) {
  if (aqi === null) return 'Unavailable';
  if (aqi <= 50) return 'Good'; if (aqi <= 100) return 'Moderate'; if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy'; if (aqi <= 300) return 'Very unhealthy'; return 'Hazardous';
}

export class AirQualityMapAdapter {
  private cache = new Map<string, { expires: number; value: AirMapData }>();
  constructor(private fetcher: SafeFetch, private airNowKey: string | null = null) {}

  async read(bounds: { north: number; south: number; east: number; west: number }): Promise<AirMapData> {
    const key = Object.values(bounds).map((v) => v.toFixed(2)).join(':');
    const cached = this.cache.get(key); if (cached && cached.expires > Date.now()) return cached.value;
    const rows = 6; const cols = 6; const latitude: number[] = []; const longitude: number[] = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      latitude.push(bounds.south + ((bounds.north - bounds.south) * row) / (rows - 1));
      longitude.push(bounds.west + ((bounds.east - bounds.west) * col) / (cols - 1));
    }
    const modelUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    modelUrl.searchParams.set('latitude', latitude.join(',')); modelUrl.searchParams.set('longitude', longitude.join(','));
    modelUrl.searchParams.set('current', 'us_aqi,pm2_5,pm10'); modelUrl.searchParams.set('timeformat', 'unixtime');
    const response = await this.fetcher(modelUrl.toString()); if (!response.ok) throw new Error('Open-Meteo map request failed');
    const parsed = ModelSchema.parse(await response.json()); const models = Array.isArray(parsed) ? parsed : [parsed];
    const modelPoints = models.map((item, index): AirPoint => ({ id: `model-${index}`, latitude: item.latitude, longitude: item.longitude, usAqi: item.current.us_aqi, pm25: item.current.pm2_5, pm10: item.current.pm10, category: aqiCategory(item.current.us_aqi), observedAt: new Date(item.current.time * 1000).toISOString(), source: 'Open-Meteo / CAMS' }));
    let stations: AirPoint[] = [];
    if (this.airNowKey) try { stations = await this.readStations(bounds); } catch { stations = []; }
    const value = { modelPoints, stations, stationStatus: stations.length ? 'CURRENT' as const : 'UNAVAILABLE' as const };
    this.cache.set(key, { expires: Date.now() + 5 * 60_000, value }); return value;
  }

  async detail(latitude: number, longitude: number): Promise<AirDetail> {
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    url.searchParams.set('latitude', String(latitude)); url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'us_aqi,pm2_5,pm10'); url.searchParams.set('hourly', 'us_aqi'); url.searchParams.set('forecast_days', '2'); url.searchParams.set('timeformat', 'unixtime');
    const response = await this.fetcher(url.toString()); if (!response.ok) throw new Error('Open-Meteo detail request failed');
    const item = DetailSchema.parse(await response.json());
    const now = item.current.time;
    return { id: 'selected-location', latitude: item.latitude, longitude: item.longitude, usAqi: item.current.us_aqi, pm25: item.current.pm2_5, pm10: item.current.pm10, category: aqiCategory(item.current.us_aqi), observedAt: new Date(now * 1000).toISOString(), source: 'Open-Meteo / CAMS', forecast: item.hourly.time.map((at, i) => ({ at: new Date(at * 1000).toISOString(), usAqi: item.hourly.us_aqi[i] ?? null })).filter((point) => point.at > new Date(now * 1000).toISOString()).slice(0, 12) };
  }

  private async readStations(bounds: { north: number; south: number; east: number; west: number }) {
    const end = new Date(); const start = new Date(end.getTime() - 2 * 60 * 60_000); const stamp = (date: Date) => date.toISOString().slice(0, 13);
    const url = new URL('https://www.airnowapi.org/aq/data/');
    url.searchParams.set('startDate', stamp(start)); url.searchParams.set('endDate', stamp(end)); url.searchParams.set('parameters', 'PM25,PM10,OZONE');
    url.searchParams.set('BBOX', `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`); url.searchParams.set('dataType', 'A'); url.searchParams.set('format', 'application/json'); url.searchParams.set('verbose', '1'); url.searchParams.set('monitorType', '0'); url.searchParams.set('includerawconcentrations', '1'); url.searchParams.set('API_KEY', this.airNowKey!);
    const response = await this.fetcher(url.toString()); if (!response.ok) throw new Error('AirNow station request failed');
    const raw = StationSchema.parse(await response.json()); const grouped = new Map<string, AirPoint>();
    for (const row of raw) { const id = `${row.Latitude}:${row.Longitude}`; const point = grouped.get(id) ?? { id: `station-${id}`, latitude: row.Latitude, longitude: row.Longitude, usAqi: null, pm25: null, pm10: null, category: 'Unavailable', observedAt: row.UTC ?? new Date().toISOString(), source: 'AirNow', siteName: row.SiteName ?? row.ReportingArea ?? 'AirNow monitoring site' }; const parameter = (row.Parameter ?? row.ParameterName ?? '').toUpperCase(); if (row.AQI != null) point.usAqi = Math.max(point.usAqi ?? 0, row.AQI); if (parameter.includes('PM25')) point.pm25 = row.RawConcentration ?? null; if (parameter.includes('PM10')) point.pm10 = row.RawConcentration ?? null; point.category = aqiCategory(point.usAqi); grouped.set(id, point); }
    return [...grouped.values()];
  }
}
