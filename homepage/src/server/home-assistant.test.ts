import { describe, expect, it } from 'vitest';
import { BootstrapSchema } from '../shared/contracts.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { HomeAssistantIndoorAdapter } from './home-assistant.js';

const now = () => new Date('2026-07-24T12:00:00.000Z');
const state = (entity_id: string, value: string, last_updated = '2026-07-24T11:59:30.000Z') => ({ entity_id, state: value, last_updated, attributes: {} });

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
});
