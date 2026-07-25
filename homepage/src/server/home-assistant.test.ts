import { describe, expect, it } from 'vitest';
import { BootstrapSchema } from '../shared/contracts.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { HomeAssistantControlMapSchema } from './home-assistant-actions.js';
import { HomeAssistantIndoorAdapter } from './home-assistant.js';

const now = () => new Date('2026-07-24T12:00:00.000Z');
const state = (entity_id: string, value: string, last_updated = '2026-07-24T11:59:30.000Z', last_reported?: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state: value, last_updated, ...(last_reported ? { last_reported } : {}), attributes });
const controls = HomeAssistantControlMapSchema.parse({
  nest_living_room: { primary: 'climate.private_nest' },
  coway_living_room: { primary: 'fan.private_living' },
  coway_bedroom: { primary: 'fan.private_bedroom' },
});

describe('Home Assistant indoor adapter', () => {
  it('normalizes only fixed indoor aliases and never returns entity identifiers', async () => {
    const adapter = new HomeAssistantIndoorAdapter('http://home-assistant.test:8123', 'private-token', async (url, init) => {
      expect(url).toBe('http://home-assistant.test:8123/api/states');
      expect(init.headers).toMatchObject({ authorization: 'Bearer private-token' });
      return {
        ok: true,
        json: async () => [
          state('sensor.indoor_aranet_temperature', '69.8'), state('sensor.indoor_aranet_humidity', '43'),
          state('sensor.indoor_aranet_pressure', '1012'), state('sensor.indoor_aranet_co2', '612'),
          state('sensor.indoor_aranet_battery', '92'), state('sensor.indoor_nest_temperature', '70'),
          state('sensor.indoor_nest_humidity', '42'), state('sensor.indoor_coway_living_room_pm25', '7'),
          state('sensor.indoor_coway_bedroom_pm25', '9'), state('sensor.vendor_serial_123', 'secret'),
        ],
      };
    }, now);
    const indoor = await adapter.read();
    expect(indoor.rooms[0]).toMatchObject({ temperatureF: 70, humidityPercent: 43, co2Ppm: 612, pm25WorstMicrogramsM3: 7 });
    expect(indoor.sensors[0].sourceState).toBe('AVAILABLE');
    const publicBody = JSON.stringify({ ...healthyBootstrapFixture, indoor });
    expect(BootstrapSchema.safeParse({ ...healthyBootstrapFixture, indoor }).success).toBe(true);
    expect(publicBody).not.toMatch(/entity_id|vendor_serial|private-token|sensor\./);
  });

  it('nulls stale values and fails closed with redacted unavailable state', async () => {
    const stale = new HomeAssistantIndoorAdapter('http://home-assistant.test:8123', 'token', async () => ({
      ok: true, json: async () => [state('sensor.indoor_aranet_co2', '900', '2026-07-24T11:50:00.000Z')],
    }), now);
    expect((await stale.read()).sensors[0].readings.co2).toMatchObject({ value: null, metadata: { freshness: 'STALE', sourceState: 'DEGRADED' } });

    const failed = new HomeAssistantIndoorAdapter('http://home-assistant.test:8123', 'token=never-return', async () => { throw new Error('entity_id=sensor.private token=never-return'); }, now);
    const body = JSON.stringify(await failed.read());
    expect(body).not.toMatch(/entity_id|sensor\.private|never-return|token/);
    expect(JSON.parse(body).thermostats[0]).toMatchObject({ sourceState: 'UNAVAILABLE', currentTemperature: { value: null } });
  });

  it('uses a fresh report timestamp when an unchanged value has an older update timestamp', async () => {
    const adapter = new HomeAssistantIndoorAdapter('http://home-assistant.test:8123', 'token', async () => ({
      ok: true,
      json: async () => [state('sensor.indoor_aranet_co2', '612', '2026-07-24T10:00:00.000Z', '2026-07-24T11:59:45.000Z')],
    }), now);
    expect((await adapter.read()).sensors[0].readings.co2).toMatchObject({
      value: 612,
      metadata: { observedAt: '2026-07-24T11:59:45.000Z', freshness: 'CURRENT', sourceState: 'AVAILABLE' },
    });
  });

  it('honors the normalized Home Assistant freshness contract for stable values', async () => {
    const adapter = new HomeAssistantIndoorAdapter('http://home-assistant.test:8123', 'token', async () => ({
      ok: true,
      json: async () => [
        state('sensor.indoor_nest_temperature', '72.32', '2026-07-24T10:00:00.000Z', undefined, { freshness: 'CURRENT' }),
        state('sensor.indoor_coway_living_room_pm25', '1', '2026-07-24T10:00:00.000Z', undefined, { freshness: 'CURRENT' }),
      ],
    }), now);
    const indoor = await adapter.read();
    expect(indoor.thermostats[0].currentTemperature).toMatchObject({
      value: 72.32,
      metadata: { observedAt: '2026-07-24T12:00:00.000Z', freshness: 'CURRENT', sourceState: 'AVAILABLE' },
    });
    expect(indoor.purifiers[0].readings.pm25).toMatchObject({
      value: 1,
      metadata: { observedAt: '2026-07-24T12:00:00.000Z', freshness: 'CURRENT', sourceState: 'AVAILABLE' },
    });
  });

  it('normalizes metric Nest target temperatures to whole Fahrenheit setpoints', async () => {
    const adapter = new HomeAssistantIndoorAdapter('http://home-assistant.test:8123', 'token', async () => ({
      ok: true,
      json: async () => [
        state('sensor.indoor_nest_temperature', '74.3', undefined, undefined, { freshness: 'CURRENT' }),
        state('climate.private_nest', 'heat_cool', undefined, undefined, {
          target_temp_low: 19.3, target_temp_high: 22.5, temperature_unit: '°C',
        }),
      ],
    }), now, controls);
    expect((await adapter.read()).thermostats[0]).toMatchObject({
      hvacMode: 'HEAT_COOL',
      heatSetpointF: 67,
      coolSetpointF: 73,
    });
  });
});
