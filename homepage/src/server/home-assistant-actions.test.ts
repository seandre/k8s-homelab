import { describe, expect, it } from 'vitest';
import { HomeAssistantActionExecutor, HomeAssistantControlMapSchema } from './home-assistant-actions.js';

const mapping = HomeAssistantControlMapSchema.parse({
  nest_living_room: { primary: 'climate.private_nest' },
  coway_living_room: { primary: 'fan.private_living', timer: 'select.private_timer', light: 'select.private_light', buttonLock: 'switch.private_lock', sensitivity: 'select.private_sensitivity' },
  coway_bedroom: { primary: 'fan.private_bedroom', timer: 'select.private_bedroom_timer', light: 'select.private_bedroom_light', buttonLock: 'switch.private_bedroom_lock', sensitivity: 'select.private_bedroom_sensitivity' },
  airgradient_living_room: {
    displayBrightness: 'number.private_display_brightness',
    ledBrightness: 'number.private_led_brightness',
    displayTemperatureUnit: 'select.private_temperature_unit',
    pmStandard: 'select.private_pm_standard',
    ledMode: 'select.private_led_mode',
    displayTemperatureUnitOptions: { fahrenheit: 'F', celsius: 'C' },
    pmStandardOptions: { us_aqi: 'US AQI', ugm3: 'µg/m³' },
    ledModeOptions: { co2: 'CO2', pm: 'PM', off: 'Off' },
  },
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

  it.each([
    [{ type: 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS', target: 'airgradient_living_room', value: 75 }, '/api/services/number/set_value', { entity_id: 'number.private_display_brightness', value: 75 }],
    [{ type: 'AIRGRADIENT_SET_LED_BRIGHTNESS', target: 'airgradient_living_room', value: 40 }, '/api/services/number/set_value', { entity_id: 'number.private_led_brightness', value: 40 }],
    [{ type: 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT', target: 'airgradient_living_room', option: 'fahrenheit' }, '/api/services/select/select_option', { entity_id: 'select.private_temperature_unit', option: 'F' }],
    [{ type: 'AIRGRADIENT_SET_PM_STANDARD', target: 'airgradient_living_room', option: 'us_aqi' }, '/api/services/select/select_option', { entity_id: 'select.private_pm_standard', option: 'US AQI' }],
    [{ type: 'AIRGRADIENT_SET_LED_MODE', target: 'airgradient_living_room', option: 'off' }, '/api/services/select/select_option', { entity_id: 'select.private_led_mode', option: 'Off' }],
  ] as const)('maps an approved AirGradient command to one fixed HA service', async (command, path, expectedBody) => {
    let call: { url: string; body: unknown } | undefined;
    const executor = new HomeAssistantActionExecutor('http://ha.test:8123', 'token', mapping, async (url, init) => {
      call = { url, body: JSON.parse(String(init.body)) };
      return { ok: true };
    });
    await executor.execute(command);
    expect(call).toEqual({ url: `http://ha.test:8123${path}`, body: expectedBody });
    expect(JSON.stringify(command)).not.toMatch(/entity_id|number\.private|select\.private|service/);
  });

  it('rejects arbitrary AirGradient mappings and does not expose excluded actions', () => {
    expect(() => HomeAssistantControlMapSchema.parse({
      ...mapping,
      airgradient_living_room: { ...mapping.airgradient_living_room, ledMode: 'button.calibrate_co2' },
    })).toThrow();
  });
});
