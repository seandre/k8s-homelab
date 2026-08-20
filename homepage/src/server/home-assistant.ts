import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IndoorEntityAlias, IndoorState } from '../shared/contracts.js';
import { unavailableIndoorFixture } from '../shared/indoor-fixtures.js';
import type { HomeAssistantControlMap } from './home-assistant-actions.js';
import { nestSetpointToFahrenheit } from './temperature.js';

const StateSchema = z.object({
  entity_id: z.string(),
  state: z.string(),
  last_updated: z.string().datetime({ offset: true }),
  last_reported: z.string().datetime({ offset: true }).optional(),
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
  'airgradient_living_room.temperature': ['airgradient_temperature', '°F', 180],
  'airgradient_living_room.humidity': ['airgradient_humidity', '%', 180],
  'airgradient_living_room.co2': ['airgradient_co2', 'ppm', 180],
  'airgradient_living_room.pm25': ['airgradient_pm2_5', 'µg/m³', 180],
  'airgradient_living_room.pm10': ['airgradient_pm10', 'µg/m³', 180],
  'airgradient_living_room.tvoc_index': ['airgradient_tvoc_index', 'index', 180],
  'airgradient_living_room.nox_index': ['airgradient_nox_index', 'index', 180],
  'nest_living_room.current_temperature': ['nest_temperature', '°F', 300],
  'nest_living_room.humidity': ['nest_humidity', '%', 300],
  'coway_living_room.aqi': ['coway_living_room_aqi', '%', 300],
  'coway_living_room.pm25': ['coway_living_room_pm25', 'µg/m³', 300],
  'coway_living_room.pm10': ['coway_living_room_pm10', 'µg/m³', 300],
  'coway_living_room.filter_life': ['coway_living_room_filter_life', '%', 300],
  'coway_living_room.pre_filter_life': ['coway_living_room_pre_filter_life', '%', 300],
  'coway_living_room.hepa_filter_life': ['coway_living_room_hepa_filter_life', '%', 300],
  'coway_bedroom.aqi': ['coway_bedroom_aqi', '%', 300],
  'coway_bedroom.pm25': ['coway_bedroom_pm25', 'µg/m³', 300],
  'coway_bedroom.pm10': ['coway_bedroom_pm10', 'µg/m³', 300],
  'coway_bedroom.filter_life': ['coway_bedroom_filter_life', '%', 300],
  'coway_bedroom.pre_filter_life': ['coway_bedroom_pre_filter_life', '%', 300],
  'coway_bedroom.hepa_filter_life': ['coway_bedroom_hepa_filter_life', '%', 300],
} as const satisfies Partial<Record<IndoorEntityAlias, readonly [string, '°F' | '%' | 'hPa' | 'ppm' | 'µg/m³' | 'index', number]>>;

function source(alias: IndoorEntityAlias) {
  return alias.startsWith('aranet_') ? 'ARANET_LOCAL' as const : alias.startsWith('airgradient_') ? 'AIRGRADIENT_LOCAL' as const : alias.startsWith('nest_') ? 'NEST_CLOUD' as const : 'COWAY_CLOUD' as const;
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
    private readonly controls?: HomeAssistantControlMap,
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
    const getReading = (alias: keyof typeof readingCatalog, sourceFreshnessState?: HaState) => {
      const [slug, unit, staleAfterSeconds] = readingCatalog[alias];
      const state = byId.get(normalizedEntityId(slug));
      const numeric = state ? Number(state.state) : Number.NaN;
      const observedAt = sourceFreshnessState?.last_reported ?? sourceFreshnessState?.last_updated
        ?? state?.last_reported ?? state?.last_updated;
      const ageSeconds = observedAt ? Math.max(0, (this.now().getTime() - Date.parse(observedAt)) / 1_000) : undefined;
      const normalizedFreshness = state?.attributes.freshness;
      const sourceAvailable = sourceFreshnessState === undefined
        || !['unavailable', 'unknown'].includes(sourceFreshnessState.state);
      const freshnessCurrent = sourceAvailable && (normalizedFreshness === undefined
        ? ageSeconds !== undefined && ageSeconds <= staleAfterSeconds
        : normalizedFreshness === 'CURRENT');
      const current = state !== undefined && Number.isFinite(numeric) && state.state !== 'unavailable' && state.state !== 'unknown' && freshnessCurrent;
      return {
        alias, value: current ? numeric : null, unit,
        metadata: {
          source: source(alias), observedAt: observedAt ?? this.now().toISOString(),
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
    const airgradient = result.sensors[1];
    airgradient.readings = {
      temperature: getReading('airgradient_living_room.temperature'),
      humidity: getReading('airgradient_living_room.humidity'),
      co2: getReading('airgradient_living_room.co2'),
      pm25: getReading('airgradient_living_room.pm25'),
      pm10: getReading('airgradient_living_room.pm10'),
      tvocIndex: getReading('airgradient_living_room.tvoc_index'),
      noxIndex: getReading('airgradient_living_room.nox_index'),
    };
    airgradient.sourceState = airgradient.readings.co2.metadata.sourceState;
    const airgradientControls = this.controls?.airgradient_living_room;
    const airgradientControlIds = airgradientControls ? new Set([
      airgradientControls.displayBrightness, airgradientControls.ledBrightness,
      airgradientControls.displayTemperatureUnit, airgradientControls.pmStandard, airgradientControls.ledMode,
    ]) : new Set<string>();
    const airgradientControlStates = states.filter((state) => airgradientControlIds.has(state.entity_id));
    airgradient.stateVersion = airgradientControls ? version(airgradientControlStates, '') : version(states, 'indoor_airgradient_');
    const airgradientAvailable = airgradient.sourceState === 'AVAILABLE';
    const controlState = (id: string | undefined) => id ? byId.get(id) : undefined;
    const numericSetting = (id: string | undefined) => {
      const value = Number(controlState(id)?.state);
      return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
    };
    const optionSetting = (id: string | undefined, options: Record<string, string> | undefined) => {
      const raw = controlState(id)?.state;
      return raw === undefined || !options ? null : Object.entries(options).find(([, value]) => value === raw)?.[0] ?? null;
    };
    airgradient.settings = {
      displayBrightness: numericSetting(airgradientControls?.displayBrightness),
      ledBrightness: numericSetting(airgradientControls?.ledBrightness),
      displayTemperatureUnit: optionSetting(airgradientControls?.displayTemperatureUnit, airgradientControls?.displayTemperatureUnitOptions),
      pmStandard: optionSetting(airgradientControls?.pmStandard, airgradientControls?.pmStandardOptions),
      ledMode: optionSetting(airgradientControls?.ledMode, airgradientControls?.ledModeOptions),
    };
    airgradient.capabilities = {
      displayBrightness: { supported: airgradientAvailable && airgradient.settings.displayBrightness !== null, min: 0, max: 100, step: 1, dependency: 'AIRGRADIENT_LOCAL' },
      ledBrightness: { supported: airgradientAvailable && airgradient.settings.ledBrightness !== null, min: 0, max: 100, step: 1, dependency: 'AIRGRADIENT_LOCAL' },
      displayTemperatureUnits: { supported: airgradientAvailable && !!airgradientControls && Object.keys(airgradientControls.displayTemperatureUnitOptions).length > 0, options: airgradientControls ? Object.keys(airgradientControls.displayTemperatureUnitOptions) : [], dependency: 'AIRGRADIENT_LOCAL' },
      pmStandards: { supported: airgradientAvailable && !!airgradientControls && Object.keys(airgradientControls.pmStandardOptions).length > 0, options: airgradientControls ? Object.keys(airgradientControls.pmStandardOptions) : [], dependency: 'AIRGRADIENT_LOCAL' },
      ledModes: { supported: airgradientAvailable && !!airgradientControls && Object.keys(airgradientControls.ledModeOptions).length > 0, options: airgradientControls ? Object.keys(airgradientControls.ledModeOptions) : [], dependency: 'AIRGRADIENT_LOCAL' },
    };
    const nestControl = this.controls ? byId.get(this.controls.nest_living_room.primary) : undefined;
    result.thermostats[0].currentTemperature = getReading('nest_living_room.current_temperature', nestControl);
    result.thermostats[0].humidity = getReading('nest_living_room.humidity', nestControl);
    result.thermostats[0].sourceState = result.thermostats[0].currentTemperature.metadata.sourceState;
    if (nestControl && result.thermostats[0].sourceState === 'AVAILABLE') {
      const mode = nestControl.state.toUpperCase();
      result.thermostats[0].hvacMode = ['OFF', 'HEAT', 'COOL', 'HEAT_COOL'].includes(mode) ? mode as 'OFF' | 'HEAT' | 'COOL' | 'HEAT_COOL' : null;
      const heat = Number(nestControl.attributes.target_temp_low ?? nestControl.attributes.temperature);
      const cool = Number(nestControl.attributes.target_temp_high ?? nestControl.attributes.temperature);
      const sourceUnit = nestControl.attributes.temperature_unit;
      result.thermostats[0].heatSetpointF = Number.isFinite(heat) ? nestSetpointToFahrenheit(heat, sourceUnit) : null;
      result.thermostats[0].coolSetpointF = Number.isFinite(cool) ? nestSetpointToFahrenheit(cool, sourceUnit) : null;
      const fan = String(nestControl.attributes.fan_mode ?? '').toLowerCase();
      result.thermostats[0].fanTimerEndsAt = fan === 'on' ? new Date(this.now().getTime() + 720 * 60_000).toISOString() : null;
    }
    result.thermostats[0].stateVersion = this.controls
      ? version(states.filter((state) => state.entity_id === this.controls!.nest_living_room.primary), '')
      : version(states, 'indoor_nest_');
    for (const purifier of result.purifiers) {
      const alias = purifier.alias;
      purifier.readings = {
        aqi: getReading(`${alias}.aqi`), pm25: getReading(`${alias}.pm25`),
        pm10: getReading(`${alias}.pm10`), filterLife: getReading(`${alias}.filter_life`), preFilterLife: getReading(`${alias}.pre_filter_life`), hepaFilterLife: getReading(`${alias}.hepa_filter_life`),
      };
      purifier.sourceState = purifier.readings.pm25.metadata.sourceState;
      const controls = this.controls?.[alias];
      if (controls && purifier.sourceState === 'AVAILABLE') {
        const primary = byId.get(controls.primary);
        const percentage = Number(primary?.attributes.percentage);
        purifier.power = primary ? primary.state === 'on' : null;
        purifier.speed = percentage >= 90 ? 3 : percentage >= 60 ? 2 : percentage > 0 ? 1 : null;
        purifier.preset = typeof primary?.attributes.preset_mode === 'string' ? primary.attributes.preset_mode.toUpperCase() : null;
        purifier.light = controls.light ? byId.get(controls.light)?.state.toUpperCase() ?? null : null;
        purifier.buttonLock = controls.buttonLock ? byId.get(controls.buttonLock)?.state === 'on' : null;
        purifier.sensitivity = controls.sensitivity ? byId.get(controls.sensitivity)?.state.toUpperCase() ?? null : null;
        const timer = controls.timer ? Number(byId.get(controls.timer)?.state) : 0;
        purifier.timerEndsAt = Number.isFinite(timer) && timer > 0 ? new Date(this.now().getTime() + timer * 60_000).toISOString() : null;
        const ids = new Set(Object.values(controls));
        purifier.stateVersion = version(states.filter((state) => ids.has(state.entity_id)), '');
      } else {
        purifier.stateVersion = version(states, `indoor_${alias}_`);
      }
    }
    const aranet = result.sensors[0].readings;
    const ag = result.sensors[1].readings;
    const nest = result.thermostats[0];
    const living = result.purifiers[0];
    const bedroom = result.purifiers[1];
    result.rooms = [
      {
        alias: 'living_room', name: 'Living Room',
        temperatureF: ag.temperature.value ?? nest.currentTemperature.value ?? aranet.temperature.value,
        humidityPercent: ag.humidity.value ?? aranet.humidity.value,
        co2Ppm: ag.co2.value ?? aranet.co2.value,
        pm25WorstMicrogramsM3: [ag.pm25.value, living.readings.pm25.value].filter((value): value is number => value !== null).reduce<number | null>((worst, value) => worst === null ? value : Math.max(worst, value), null),
        activeAlertCount: 0,
        freshness: [ag.temperature.value !== null ? ag.temperature : nest.currentTemperature, ag.co2.value !== null ? ag.co2 : aranet.co2, ag.pm25.value !== null ? ag.pm25 : living.readings.pm25].every((item) => item.metadata.freshness === 'CURRENT') ? 'CURRENT' : 'STALE',
      },
      { alias: 'bedroom', name: 'Bedroom', temperatureF: null, humidityPercent: null, co2Ppm: null, pm25WorstMicrogramsM3: bedroom.readings.pm25.value, activeAlertCount: 0, freshness: bedroom.readings.pm25.metadata.freshness },
    ];
    return result;
  }
}
