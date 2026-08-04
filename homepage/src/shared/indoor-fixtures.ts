import type { IndoorEntityAlias, IndoorState } from './contracts.js';

const NOW = '2026-07-19T12:00:00.000Z';
type FixtureState = 'healthy' | 'partial' | 'stale' | 'unavailable' | 'unsupported';

const sourceFor = (alias: IndoorEntityAlias) => alias.startsWith('aranet_') ? 'ARANET_LOCAL' as const : alias.startsWith('airgradient_') ? 'AIRGRADIENT_LOCAL' as const : alias.startsWith('nest_') ? 'NEST_CLOUD' as const : 'COWAY_CLOUD' as const;
const reading = (alias: IndoorEntityAlias, value: number | null, unit: '°F' | '%' | 'hPa' | 'ppm' | 'µg/m³' | 'index', state: FixtureState = 'healthy') => ({
  alias, value: state === 'healthy' || state === 'partial' ? value : null, unit,
  metadata: {
    source: sourceFor(alias), observedAt: NOW,
    freshness: state === 'healthy' || state === 'partial' ? 'CURRENT' as const : state === 'stale' ? 'STALE' as const : state === 'unsupported' ? 'NOT_SUPPORTED' as const : 'UNAVAILABLE' as const,
    sourceState: state === 'healthy' || state === 'partial' ? 'AVAILABLE' as const : state === 'stale' ? 'DEGRADED' as const : 'UNAVAILABLE' as const,
    severity: state === 'healthy' ? 'OK' as const : 'INFO' as const,
    ...(state === 'stale' ? { ageSeconds: 420 } : {}),
    ...(state === 'unavailable' ? { message: 'Source is temporarily unavailable.' } : {}),
    ...(state === 'unsupported' ? { message: 'This capability is not supported.' } : {}),
  },
});
const option = (options: string[], dependency: 'NEST_CLOUD' | 'COWAY_CLOUD' | 'AIRGRADIENT_LOCAL', supported = true) => ({ supported, options: supported ? options : [], dependency });
const numbers = (values: number[], dependency: 'NEST_CLOUD' | 'COWAY_CLOUD', supported = true) => ({ supported, values: supported ? values : [], dependency });

export function indoorFixture(state: FixtureState = 'healthy'): IndoorState {
  const aranetState = state === 'partial' ? 'stale' : state;
  const nestState = state === 'partial' ? 'unavailable' : state;
  const cowayState = state === 'partial' ? 'healthy' : state;
  const airgradientState = state === 'partial' ? 'healthy' : state;
  const purifier = (alias: 'coway_living_room' | 'coway_bedroom', room: 'living_room' | 'bedroom', pm25: number) => ({
    alias, room, stateVersion: `fixture-${alias}-1`,
    sourceState: cowayState === 'healthy' ? 'AVAILABLE' as const : cowayState === 'stale' ? 'DEGRADED' as const : 'UNAVAILABLE' as const,
    dependency: 'COWAY_CLOUD' as const,
    power: cowayState === 'healthy' ? true : null, speed: cowayState === 'healthy' ? 2 as const : null,
    preset: cowayState === 'healthy' ? 'AUTO' : null, timerEndsAt: null,
    light: cowayState === 'healthy' ? 'ON' : null, buttonLock: cowayState === 'healthy' ? false : null,
    sensitivity: cowayState === 'healthy' ? 'NORMAL' : null,
    readings: {
      aqi: reading(`${alias}.aqi`, 1, '%', cowayState),
      pm25: reading(`${alias}.pm25`, pm25, 'µg/m³', cowayState),
      pm10: reading(`${alias}.pm10`, pm25 + 4, 'µg/m³', cowayState),
      filterLife: reading(`${alias}.filter_life`, 86, '%', cowayState),
      preFilterLife: reading(`${alias}.pre_filter_life`, 91, '%', cowayState),
      hepaFilterLife: reading(`${alias}.hepa_filter_life`, 83, '%', cowayState),
    },
    capabilities: {
      power: { supported: state !== 'unsupported', dependency: 'COWAY_CLOUD' as const },
      speeds: numbers([1, 2, 3], 'COWAY_CLOUD', state !== 'unsupported'),
      presets: option(['AUTO', 'NIGHT', 'RAPID'], 'COWAY_CLOUD', state !== 'unsupported'),
      timerMinutes: numbers([0, 60, 120, 240, 480], 'COWAY_CLOUD', state !== 'unsupported'),
      lightOptions: option(['ON', 'OFF', 'AQI_OFF'], 'COWAY_CLOUD', state !== 'unsupported'),
      buttonLock: { supported: state !== 'unsupported', dependency: 'COWAY_CLOUD' as const },
      sensitivityOptions: option(['SENSITIVE', 'NORMAL', 'INSENSITIVE'], 'COWAY_CLOUD', state !== 'unsupported'),
    },
  });
  const living = purifier('coway_living_room', 'living_room', 7);
  const bedroom = purifier('coway_bedroom', 'bedroom', 9);
  const airgradient = {
    alias: 'airgradient_living_room' as const, room: 'living_room' as const,
    stateVersion: 'fixture-airgradient-1',
    sourceState: airgradientState === 'healthy' ? 'AVAILABLE' as const : airgradientState === 'stale' ? 'DEGRADED' as const : 'UNAVAILABLE' as const,
    dependency: 'AIRGRADIENT_LOCAL' as const,
    readings: {
      temperature: reading('airgradient_living_room.temperature', 69.4, '°F', airgradientState),
      humidity: reading('airgradient_living_room.humidity', 44, '%', airgradientState),
      co2: reading('airgradient_living_room.co2', 618, 'ppm', airgradientState),
      pm25: reading('airgradient_living_room.pm25', 8, 'µg/m³', airgradientState),
      pm10: reading('airgradient_living_room.pm10', 11, 'µg/m³', airgradientState),
      tvocIndex: reading('airgradient_living_room.tvoc_index', 92, 'index', airgradientState),
      noxIndex: reading('airgradient_living_room.nox_index', 4, 'index', airgradientState),
    },
    settings: {
      displayBrightness: airgradientState === 'healthy' ? 80 : null,
      ledBrightness: airgradientState === 'healthy' ? 60 : null,
      displayTemperatureUnit: airgradientState === 'healthy' ? 'fahrenheit' : null,
      pmStandard: airgradientState === 'healthy' ? 'us_aqi' : null,
      ledMode: airgradientState === 'healthy' ? 'co2' : null,
    },
    capabilities: {
      displayBrightness: { supported: state !== 'unsupported', min: 0, max: 100, step: 1, dependency: 'AIRGRADIENT_LOCAL' as const },
      ledBrightness: { supported: state !== 'unsupported', min: 0, max: 100, step: 1, dependency: 'AIRGRADIENT_LOCAL' as const },
      displayTemperatureUnits: option(['celsius', 'fahrenheit'], 'AIRGRADIENT_LOCAL', state !== 'unsupported'),
      pmStandards: option(['ugm3', 'us_aqi'], 'AIRGRADIENT_LOCAL', state !== 'unsupported'),
      ledModes: option(['co2', 'pm', 'off'], 'AIRGRADIENT_LOCAL', state !== 'unsupported'),
    },
  };
  const livingPm25Values = [airgradient.readings.pm25.value, living.readings.pm25.value].filter((value): value is number => value !== null);
  return {
    rooms: [
      { alias: 'living_room', name: 'Living Room', temperatureF: nestState === 'healthy' ? 70 : aranetState === 'healthy' || aranetState === 'stale' ? 69.8 : null, humidityPercent: airgradient.readings.humidity.value ?? (aranetState === 'healthy' || aranetState === 'stale' ? 43 : null), co2Ppm: airgradient.readings.co2.value ?? (aranetState === 'healthy' || aranetState === 'stale' ? 612 : null), pm25WorstMicrogramsM3: livingPm25Values.length ? Math.max(...livingPm25Values) : null, activeAlertCount: 0, freshness: state === 'healthy' || state === 'partial' ? 'CURRENT' : state === 'stale' ? 'STALE' : state === 'unsupported' ? 'NOT_SUPPORTED' : 'UNAVAILABLE' },
      { alias: 'bedroom', name: 'Bedroom', temperatureF: null, humidityPercent: null, co2Ppm: null, pm25WorstMicrogramsM3: bedroom.readings.pm25.value, activeAlertCount: 0, freshness: bedroom.readings.pm25.metadata.freshness },
    ],
    sensors: [{
      alias: 'aranet_living_room', room: 'living_room', sourceState: aranetState === 'healthy' ? 'AVAILABLE' : aranetState === 'stale' ? 'DEGRADED' : 'UNAVAILABLE',
      readings: {
        temperature: reading('aranet_living_room.temperature', 69.8, '°F', aranetState),
        humidity: reading('aranet_living_room.humidity', 43, '%', aranetState),
        pressure: reading('aranet_living_room.pressure', 1012, 'hPa', aranetState),
        co2: reading('aranet_living_room.co2', 612, 'ppm', aranetState),
        battery: reading('aranet_living_room.battery', 92, '%', aranetState),
      },
    }, airgradient],
    thermostats: [{
      alias: 'nest_living_room', room: 'living_room', stateVersion: 'fixture-nest-1',
      sourceState: nestState === 'healthy' ? 'AVAILABLE' : nestState === 'stale' ? 'DEGRADED' : 'UNAVAILABLE',
      dependency: 'NEST_CLOUD',
      currentTemperature: reading('nest_living_room.current_temperature', 70, '°F', nestState),
      humidity: reading('nest_living_room.humidity', 42, '%', nestState),
      hvacMode: nestState === 'healthy' ? 'HEAT_COOL' : null, heatSetpointF: nestState === 'healthy' ? 68 : null,
      coolSetpointF: nestState === 'healthy' ? 74 : null, fanTimerEndsAt: null,
      capabilities: {
        hvacModes: option(['OFF', 'HEAT', 'COOL', 'HEAT_COOL'], 'NEST_CLOUD', state !== 'unsupported'),
        setpointShapes: state === 'unsupported' ? [] : ['HEAT', 'COOL', 'RANGE'],
        setpointMinF: state === 'unsupported' ? null : 50, setpointMaxF: state === 'unsupported' ? null : 90,
        setpointStepF: state === 'unsupported' ? null : 1, fanTimerMinutes: numbers([0, 720], 'NEST_CLOUD', state !== 'unsupported'),
      },
    }],
    purifiers: [living, bedroom],
    alerts: [],
    actions: [],
  };
}

export const healthyIndoorFixture = indoorFixture('healthy');
export const partialIndoorFixture = indoorFixture('partial');
export const staleIndoorFixture = indoorFixture('stale');
export const unavailableIndoorFixture = indoorFixture('unavailable');
export const unsupportedIndoorFixture = indoorFixture('unsupported');
