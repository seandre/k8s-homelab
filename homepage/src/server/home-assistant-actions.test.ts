import { describe, expect, it } from 'vitest';
import { HomeAssistantActionExecutor, HomeAssistantControlMapSchema } from './home-assistant-actions.js';

const mapping = HomeAssistantControlMapSchema.parse({
  nest_living_room: { primary: 'climate.private_nest' },
  coway_living_room: { primary: 'fan.private_living', timer: 'select.private_timer', light: 'select.private_light', buttonLock: 'switch.private_lock', sensitivity: 'select.private_sensitivity' },
  coway_bedroom: { primary: 'fan.private_bedroom', timer: 'select.private_bedroom_timer', light: 'select.private_bedroom_light', buttonLock: 'switch.private_bedroom_lock', sensitivity: 'select.private_bedroom_sensitivity' },
});

describe('Home Assistant action executor', () => {
  it('maps canonical commands to fixed services and keeps private identifiers out of the public command', async () => {
    let call: { url: string; init: RequestInit } | undefined;
    const executor = new HomeAssistantActionExecutor('http://ha.test:8123', 'private-token', mapping, async (url, init) => { call = { url, init }; return { ok: true }; });
    const command = { type: 'COWAY_SET_SPEED', target: 'coway_living_room', speed: 2 } as const;
    await executor.execute(command);
    expect(call?.url).toBe('http://ha.test:8123/api/services/fan/set_percentage');
    expect(JSON.parse(String(call?.init.body))).toEqual({ entity_id: 'fan.private_living', percentage: 66 });
    expect(JSON.stringify(command)).not.toMatch(/entity_id|fan\.private|service/);
  });

  it('uses only schema-approved mappings and reports upstream failure without leaking it', async () => {
    expect(() => HomeAssistantControlMapSchema.parse({ ...mapping, nest_living_room: { primary: 'script.raw_service' } })).toThrow();
    const executor = new HomeAssistantActionExecutor('http://ha.test', 'token', mapping, async () => ({ ok: false }));
    await expect(executor.execute({ type: 'NEST_SET_HVAC_MODE', target: 'nest_living_room', mode: 'HEAT' })).rejects.toThrow('Home Assistant action failed.');
  });

  it('converts approved Fahrenheit setpoints to Home Assistant metric service values', async () => {
    let body: unknown;
    const executor = new HomeAssistantActionExecutor('http://ha.test:8123', 'token', mapping, async (_url, init) => {
      body = JSON.parse(String(init.body));
      return { ok: true };
    });
    await executor.execute({
      type: 'NEST_SET_SETPOINT',
      target: 'nest_living_room',
      setpoint: { shape: 'RANGE', heatTemperatureF: 68, coolTemperatureF: 74 },
    });
    expect(body).toEqual({
      entity_id: 'climate.private_nest',
      target_temp_low: 20,
      target_temp_high: 23.33,
    });
  });
});
