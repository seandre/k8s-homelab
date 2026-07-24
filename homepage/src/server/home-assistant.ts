import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IndoorEntityAlias, IndoorState } from '../shared/contracts.js';
import { unavailableIndoorFixture } from '../shared/indoor-fixtures.js';

const StateSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  last_updated: z.string().datetime({ offset: true }),
  attributes: z.record(z.unknown()),
});
const StatesSchema = z.array(StateSchema);
type HaState = z.infer<typeof StateSchema>;
export type HomeAssistantFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const readingCatalog = {
  'aranet_living_room.temperature': ['aranet_temperature', '°F', 180],
  'aranet_living_room.humidity': ['aranet_humidity', '%', 180],
  'aranet_living_room.pressure': ['aranet_pressure', 'hPa', 180],
  'aranet_living_room.co2': ['aranet_co2', 'ppm', 180],
  'aranet_living_room.battery': ['aranet_battery', '%', 180],
  'nest_living_room.current_temperature': ['nest_temperature', '°F', 300],
  'nest_living_room.humidity': ['nest_humidity', '%', 300],
  'coway_living_room.aqi': ['coway_living_room_aqi', '%', 300],
  'coway_living_room.pm25': ['coway_living_room_pm25', 'µg/m³', 300],
  'coway_living_room.pm10': ['coway_living_room_pm10', 'µg/m³', 300],
  'coway_living_room.filter_life': ['coway_living_room_filter_life', '%', 300],
  'coway_bedroom.aqi': ['coway_bedroom_aqi', '%', 300],
  'coway_bedroom.pm25': ['coway_bedroom_pm25', 'µg/m³', 300],
  'coway_bedroom.pm10': ['coway_bedroom_pm10', 'µg/m³', 300],
  'coway_bedroom.filter_life': ['coway_bedroom_filter_life', '%', 300],
} as const satisfies Partial<Record<IndoorEntityAlias, readonly [string, '°F' | '%' | 'hPa' | 'ppm' | 'µg/m³', number]>>;

function source(alias: IndoorEntityAlias) {
  return alias.startsWith('aranet_') ? 'ARANET_LOCAL' as const : alias.startsWith('nest_') ? 'NEST_CLOUD' as const : 'COWAY_CLOUD' as const;
}

function normalizedEntityId(slug: string) {
  return `sensor.indoor_${slug}`;
}

function version(states: HaState[], prefix: string) {
  return createHash('sha256').update(states.filter((state) => state.entity_id.includes(prefix)).map((state) => `${state.state}:${state.last_updated}`).join('|')).digest('hex').slice(0, 20);
}

export class HomeAssistantIndoorAdapter {
  constructor(
    private readonly server: string,
    private readonly token: string | null,
    private readonly fetcher: HomeAssistantFetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(): Promise<IndoorState> {
    if (!this.token) return structuredClone(unavailableIndoorFixture);
    try {
      const response = await this.fetcher(`${this.server.replace(/\/$/, '')}/api/states`, {
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Home Assistant request failed.');
      return this.normalize(StatesSchema.parse(await response.json()));
    } catch {
      return structuredClone(unavailableIndoorFixture);
    }
  }

  private normalize(states: HaState[]): IndoorState {
    const result = structuredClone(unavailableIndoorFixture);
    const byId = new Map(states.map((state) => [state.entity_id, state]));
    const getReading = (alias: keyof typeof readingCatalog) => {
      const [slug, unit, staleAfterSeconds] = readingCatalog[alias];
      const state = byId.get(normalizedEntityId(slug));
      const numeric = state ? Number(state.state) : Number.NaN;
      const ageSeconds = state ? Math.max(0, (this.now().getTime() - Date.parse(state.last_updated)) / 1_000) : undefined;
      const current = state !== undefined && Number.isFinite(numeric) && state.state !== 'unavailable' && state.state !== 'unknown' && ageSeconds !== undefined && ageSeconds <= staleAfterSeconds;
      return {
        alias, value: current ? numeric : null, unit,
        metadata: {
          source: source(alias), observedAt: state?.last_updated ?? this.now().toISOString(),
          freshness: current ? 'CURRENT' as const : state ? 'STALE' as const : 'UNAVAILABLE' as const,
          sourceState: current ? 'AVAILABLE' as const : state ? 'DEGRADED' as const : 'UNAVAILABLE' as const,
          severity: current ? 'OK' as const : 'INFO' as const,
          ...(ageSeconds !== undefined ? { ageSeconds } : {}),
          ...(!current ? { message: state ? 'The last observation is stale.' : 'Source is temporarily unavailable.' } : {}),
        },
      };
    };
    result.sensors[0].readings = {
      temperature: getReading('aranet_living_room.temperature'), humidity: getReading('aranet_living_room.humidity'),
      pressure: getReading('aranet_living_room.pressure'), co2: getReading('aranet_living_room.co2'),
      battery: getReading('aranet_living_room.battery'),
    };
    result.sensors[0].sourceState = result.sensors[0].readings.co2.metadata.sourceState;
    result.thermostats[0].currentTemperature = getReading('nest_living_room.current_temperature');
    result.thermostats[0].humidity = getReading('nest_living_room.humidity');
    result.thermostats[0].sourceState = result.thermostats[0].currentTemperature.metadata.sourceState;
    result.thermostats[0].stateVersion = version(states, 'indoor_nest_');
    for (const purifier of result.purifiers) {
      const alias = purifier.alias;
      purifier.readings = {
        aqi: getReading(`${alias}.aqi`), pm25: getReading(`${alias}.pm25`),
        pm10: getReading(`${alias}.pm10`), filterLife: getReading(`${alias}.filter_life`),
      };
      purifier.sourceState = purifier.readings.pm25.metadata.sourceState;
      purifier.stateVersion = version(states, `indoor_${alias.replace('coway_', 'coway_')}_`);
    }
    const aranet = result.sensors[0].readings;
    const nest = result.thermostats[0];
    const living = result.purifiers[0];
    const bedroom = result.purifiers[1];
    result.rooms = [
      { alias: 'living_room', name: 'Living Room', temperatureF: nest.currentTemperature.value ?? aranet.temperature.value, humidityPercent: aranet.humidity.value, co2Ppm: aranet.co2.value, pm25WorstMicrogramsM3: living.readings.pm25.value, activeAlertCount: 0, freshness: [nest.currentTemperature, aranet.co2, living.readings.pm25].every((item) => item.metadata.freshness === 'CURRENT') ? 'CURRENT' : 'STALE' },
      { alias: 'bedroom', name: 'Bedroom', temperatureF: null, humidityPercent: null, co2Ppm: null, pm25WorstMicrogramsM3: bedroom.readings.pm25.value, activeAlertCount: 0, freshness: bedroom.readings.pm25.metadata.freshness },
    ];
    return result;
  }
}
