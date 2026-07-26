import { z } from 'zod';
import type { SourceMetadata, Weather } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock } from './normalization.js';

const NWS_USER_AGENT = 'home.lab.seandre.dev weather dashboard (https://home.lab.seandre.dev)';
const CONDITIONS_REFRESH_MS = 10 * 60_000;
const AIR_REFRESH_MS = 30 * 60_000;
const DISCOVERY_REFRESH_MS = 24 * 60 * 60_000;

const NwsPointSchema = z.object({
  properties: z.object({
    observationStations: z.string().url(),
    forecastHourly: z.string().url(),
  }),
});
const NwsStationsSchema = z.object({
  features: z.array(z.object({ id: z.string().url() })).min(1),
});
const NwsObservationSchema = z.object({
  properties: z.object({
    timestamp: z.string().datetime({ offset: true }),
    temperature: z.object({ value: z.number().nullable() }),
    textDescription: z.string().nullable(),
  }),
});
const NwsForecastSchema = z.object({
  properties: z.object({
    periods: z.array(z.object({
      startTime: z.string().datetime({ offset: true }),
      temperature: z.number(),
      temperatureUnit: z.enum(['F', 'C']),
      shortForecast: z.string(),
    })).min(1),
  }),
});
const OpenMeteoConditionsSchema = z.object({
  current: z.object({ time: z.number().int(), temperature_2m: z.number(), weather_code: z.number().int() }),
  daily: z.object({ sunrise: z.array(z.number().int()).min(1), sunset: z.array(z.number().int()).min(1) }),
});
const OpenMeteoAirSchema = z.object({
  current: z.object({ time: z.number().int(), us_aqi: z.number().nonnegative(), pm2_5: z.number().nonnegative(), pm10: z.number().nonnegative() }),
});
const AirNowSchema = z.array(z.object({
  ParameterName: z.string(),
  AQI: z.number().int().nonnegative(),
}));

type ConditionsValue = {
  source: string;
  temperatureFahrenheit: number;
  condition: string;
  sunrise: string | null;
  sunset: string | null;
};
type AirValue = {
  source: string;
  usAqi: number;
  pm25: number;
  pm10: number;
};

export interface FetchResponse { ok: boolean; status?: number; json(): Promise<unknown>; }
export type SafeFetch = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<FetchResponse>;
export type WeatherDiagnostic = (event: { provider: 'nws' | 'airnow' | 'open-meteo'; operation: string; reason: string }) => void;

export interface OpenMeteoOptions {
  fetch: SafeFetch;
  latitude: number;
  longitude: number;
  enabled: boolean;
  airNowApiKey?: string | null;
  timeoutMs?: number;
  clock?: Clock;
  diagnostic?: WeatherDiagnostic;
}

function isoFromUnix(seconds: number) { return new Date(seconds * 1_000).toISOString(); }
function fahrenheit(celsius: number) { return (celsius * 9) / 5 + 32; }
function forecastTemperature(value: number, unit: 'F' | 'C') { return unit === 'F' ? value : fahrenheit(value); }

function conditionFromCode(code: number) {
  if (code === 0) return 'Clear sky';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Unknown conditions';
}

function metadataWithSource(metadata: SourceMetadata, source: string): SourceMetadata {
  return { ...metadata, source };
}

class ProviderError extends Error {
  constructor(readonly status: number | undefined) {
    super(status === undefined ? 'invalid response' : `HTTP ${status}`);
  }
}

/**
 * Weather provider chain:
 * - NWS observation -> NWS hourly forecast -> Open-Meteo for conditions
 * - AirNow -> Open-Meteo for AQI
 * Open-Meteo remains necessary for sunrise/sunset and PM concentrations.
 *
 * The historical class name is retained to avoid changing the public server API.
 */
export class OpenMeteoAdapter {
  private readonly conditions;
  private readonly air;
  private readonly fetcher: SafeFetch;
  private readonly latitude: number;
  private readonly longitude: number;
  private readonly airNowApiKey: string | null;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly clock: Clock;
  private readonly diagnostic: WeatherDiagnostic;
  private nextConditionsAt = 0;
  private nextAirAt = 0;
  private discoveryExpiresAt = 0;
  private nwsStationUrl: string | undefined;
  private nwsForecastUrl: string | undefined;

  constructor(options: OpenMeteoOptions) {
    const inactive = !options.enabled;
    this.conditions = new SourceNormalizer<ConditionsValue>({ source: 'nws-conditions', staleAfterMs: 20 * 60_000, circuitCooldownMs: 5 * 60_000, unsupported: inactive, ...(options.clock ? { clock: options.clock } : {}) });
    this.air = new SourceNormalizer<AirValue>({ source: 'airnow-air-quality', staleAfterMs: 75 * 60_000, circuitCooldownMs: 15 * 60_000, unsupported: inactive, ...(options.clock ? { clock: options.clock } : {}) });
    this.fetcher = options.fetch;
    this.latitude = options.latitude;
    this.longitude = options.longitude;
    this.airNowApiKey = options.airNowApiKey?.trim() || null;
    this.enabled = options.enabled;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.clock = options.clock ?? { now: () => new Date() };
    this.diagnostic = options.diagnostic ?? ((event) => console.warn(JSON.stringify({ event: 'weather_upstream_failure', ...event })));
  }

  async read(): Promise<Weather> {
    const now = this.clock.now().getTime();
    const tasks: Promise<void>[] = [];
    if (this.enabled && now >= this.nextConditionsAt) {
      this.nextConditionsAt = now + CONDITIONS_REFRESH_MS;
      tasks.push(this.refreshConditions());
    }
    if (this.enabled && now >= this.nextAirAt) {
      this.nextAirAt = now + AIR_REFRESH_MS;
      tasks.push(this.refreshAirQuality());
    }
    await Promise.all(tasks);

    const conditions = this.conditions.snapshot();
    const air = this.air.snapshot();
    const conditionValue = conditions.value;
    const airValue = air.value;
    const severity = conditions.metadata.severity === 'CRIT' || air.metadata.severity === 'CRIT' ? 'CRIT' : conditions.metadata.severity === 'WARN' || air.metadata.severity === 'WARN' ? 'WARN' : conditions.metadata.severity === 'INFO' || air.metadata.severity === 'INFO' ? 'INFO' : 'OK';
    const conditionsMetadata = metadataWithSource(conditions.metadata, conditionValue?.source ?? conditions.metadata.source);
    const airQualityMetadata = metadataWithSource(air.metadata, airValue?.source ?? air.metadata.source);
    return {
      location: 'Portland, OR 97209',
      temperatureFahrenheit: conditionValue?.temperatureFahrenheit ?? null,
      condition: conditionValue?.condition ?? null,
      sunrise: conditionValue?.sunrise ?? null,
      sunset: conditionValue?.sunset ?? null,
      usAqi: airValue?.usAqi ?? null,
      pm25: airValue?.pm25 ?? null,
      pm10: airValue?.pm10 ?? null,
      conditionsMetadata,
      airQualityMetadata,
      metadata: { ...conditionsMetadata, severity },
    };
  }

  private async request(provider: 'nws' | 'airnow' | 'open-meteo', operation: string, url: URL | string, headers?: Record<string, string>) {
    try {
      const response = await withTimeout(this.fetcher(url.toString(), headers ? { headers } : undefined), this.timeoutMs);
      if (!response.ok) throw new ProviderError(response.status);
      return await response.json();
    } catch (error) {
      const reason = error instanceof ProviderError ? error.message : error instanceof z.ZodError ? 'schema validation failed' : error instanceof Error ? error.name : 'request failed';
      this.diagnostic({ provider, operation, reason });
      throw error;
    }
  }

  private async discoverNws() {
    const now = this.clock.now().getTime();
    if (this.nwsStationUrl && this.nwsForecastUrl && now < this.discoveryExpiresAt) return;
    const point = NwsPointSchema.parse(await this.request('nws', 'point discovery', `https://api.weather.gov/points/${this.latitude},${this.longitude}`, { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }));
    const stations = NwsStationsSchema.parse(await this.request('nws', 'station discovery', point.properties.observationStations, { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }));
    this.nwsStationUrl = stations.features[0]!.id;
    this.nwsForecastUrl = point.properties.forecastHourly;
    this.discoveryExpiresAt = now + DISCOVERY_REFRESH_MS;
  }

  private async openMeteoConditions() {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(this.latitude), longitude: String(this.longitude), current: 'temperature_2m,weather_code', daily: 'sunrise,sunset', temperature_unit: 'fahrenheit', timezone: 'America/Los_Angeles', timeformat: 'unixtime' }).toString();
    return OpenMeteoConditionsSchema.parse(await this.request('open-meteo', 'conditions fallback', url));
  }

  private async refreshConditions() {
    if (!this.conditions.canAttempt()) return;
    try {
      // Attach the rejection handler immediately while the independent NWS
      // discovery chain runs, avoiding an unhandled fallback rejection.
      const openMeteoPromise = this.openMeteoConditions()
        .then((value) => ({ value, error: undefined }))
        .catch((error: unknown) => ({ value: undefined, error }));
      let nwsObservation: z.infer<typeof NwsObservationSchema> | undefined;
      let nwsForecast: z.infer<typeof NwsForecastSchema> | undefined;
      try {
        await this.discoverNws();
        const [observationResult, forecastResult] = await Promise.allSettled([
          this.request('nws', 'latest observation', `${this.nwsStationUrl}/observations/latest`, { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }).then((value) => NwsObservationSchema.parse(value)),
          this.request('nws', 'hourly forecast', this.nwsForecastUrl!, { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }).then((value) => NwsForecastSchema.parse(value)),
        ]);
        if (observationResult.status === 'fulfilled') nwsObservation = observationResult.value;
        if (forecastResult.status === 'fulfilled') nwsForecast = forecastResult.value;
        if (!nwsObservation && !nwsForecast) throw new Error('NWS observation and forecast unavailable.');
      } catch {
        // The independently fetched Open-Meteo result below is the outage fallback.
      }
      const openMeteoResult = await openMeteoPromise;
      const backup = openMeteoResult.value;
      const observation = nwsObservation?.properties;
      const forecast = nwsForecast?.properties.periods[0];
      const hasObservation = observation?.temperature.value !== null && observation?.temperature.value !== undefined;
      if (!hasObservation && !forecast && !backup) throw openMeteoResult.error ?? new Error('No weather provider returned conditions.');
      const temperatureFahrenheit = hasObservation ? fahrenheit(observation!.temperature.value!) : forecast ? forecastTemperature(forecast.temperature, forecast.temperatureUnit) : backup!.current.temperature_2m;
      const condition = observation?.textDescription || forecast?.shortForecast || conditionFromCode(backup!.current.weather_code);
      const source = hasObservation ? 'nws-observation' : forecast ? 'nws-hourly-forecast' : 'open-meteo-fallback';
      const sampledAt = hasObservation ? new Date(observation!.timestamp) : forecast ? new Date(forecast.startTime) : new Date(backup!.current.time * 1_000);
      this.conditions.recordSuccess({
        source,
        temperatureFahrenheit,
        condition,
        sunrise: backup ? isoFromUnix(backup.daily.sunrise[0]!) : null,
        sunset: backup ? isoFromUnix(backup.daily.sunset[0]!) : null,
      }, sampledAt);
    } catch {
      this.conditions.recordFailure();
    }
  }

  private async refreshAirQuality() {
    if (!this.air.canAttempt()) return;
    try {
      const openUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
      openUrl.search = new URLSearchParams({ latitude: String(this.latitude), longitude: String(this.longitude), current: 'us_aqi,pm2_5,pm10', timezone: 'America/Los_Angeles', timeformat: 'unixtime' }).toString();
      const open = OpenMeteoAirSchema.parse(await this.request('open-meteo', 'air quality fallback', openUrl));
      let airNowAqi: number | undefined;
      if (this.airNowApiKey) {
        const airNowUrl = new URL('https://www.airnowapi.org/aq/observation/latLong/current/');
        airNowUrl.search = new URLSearchParams({ format: 'application/json', latitude: String(this.latitude), longitude: String(this.longitude), distance: '25', API_KEY: this.airNowApiKey }).toString();
        try {
          const records = AirNowSchema.parse(await this.request('airnow', 'current observation', airNowUrl));
          airNowAqi = records.reduce<number | undefined>((highest, record) => highest === undefined || record.AQI > highest ? record.AQI : highest, undefined);
        } catch {
          // Open-Meteo remains the AQI fallback.
        }
      }
      this.air.recordSuccess({
        source: airNowAqi === undefined ? 'open-meteo-fallback' : 'airnow+open-meteo-pm',
        usAqi: airNowAqi ?? open.current.us_aqi,
        pm25: open.current.pm2_5,
        pm10: open.current.pm10,
      }, new Date(open.current.time * 1_000));
    } catch {
      this.air.recordFailure();
    }
  }
}
