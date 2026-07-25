import { z } from 'zod';
import type { IndoorCommand } from '../shared/contracts.js';
import type { IndoorActionExecutor } from './indoor-actions.js';
import { fahrenheitToCelsius } from './temperature.js';

const EntityIdSchema = z.string().regex(/^(climate|fan|select|switch)\.[a-z0-9_]+$/);
const TargetSchema = z.object({
  primary: EntityIdSchema,
  timer: EntityIdSchema.optional(),
  light: EntityIdSchema.optional(),
  buttonLock: EntityIdSchema.optional(),
  sensitivity: EntityIdSchema.optional(),
}).strict();
export const HomeAssistantControlMapSchema = z.object({
  nest_living_room: TargetSchema,
  coway_living_room: TargetSchema,
  coway_bedroom: TargetSchema,
}).strict();
export type HomeAssistantControlMap = z.infer<typeof HomeAssistantControlMapSchema>;

type ServiceCall = { domain: 'climate' | 'fan' | 'select' | 'switch'; service: string; data: Record<string, unknown> };

function service(command: IndoorCommand, mapping: HomeAssistantControlMap): ServiceCall {
  const entities = mapping[command.target];
  switch (command.type) {
    case 'NEST_SET_HVAC_MODE':
      return { domain: 'climate', service: 'set_hvac_mode', data: { entity_id: entities.primary, hvac_mode: command.mode.toLowerCase() } };
    case 'NEST_SET_SETPOINT': {
      const s = command.setpoint;
      const temperatures = s.shape === 'HEAT' ? { temperature: fahrenheitToCelsius(s.temperatureF) }
        : s.shape === 'COOL' ? { temperature: fahrenheitToCelsius(s.temperatureF) }
        : { target_temp_low: fahrenheitToCelsius(s.heatTemperatureF), target_temp_high: fahrenheitToCelsius(s.coolTemperatureF) };
      return { domain: 'climate', service: 'set_temperature', data: { entity_id: entities.primary, ...temperatures } };
    }
    case 'NEST_SET_FAN_TIMER':
      return { domain: 'climate', service: 'set_fan_mode', data: { entity_id: entities.primary, fan_mode: command.durationMinutes === 0 ? 'off' : 'on' } };
    case 'COWAY_SET_POWER':
      return { domain: 'fan', service: command.power ? 'turn_on' : 'turn_off', data: { entity_id: entities.primary } };
    case 'COWAY_SET_PRESET':
      return { domain: 'fan', service: 'set_preset_mode', data: { entity_id: entities.primary, preset_mode: command.preset[0] + command.preset.slice(1).toLowerCase() } };
    case 'COWAY_SET_SPEED':
      return { domain: 'fan', service: 'set_percentage', data: { entity_id: entities.primary, percentage: command.speed === 1 ? 33 : command.speed === 2 ? 66 : 100 } };
    case 'COWAY_SET_TIMER':
      if (!entities.timer) throw new Error('Control mapping is unavailable.');
      return { domain: 'select', service: 'select_option', data: { entity_id: entities.timer, option: String(command.durationMinutes) } };
    case 'COWAY_SET_LIGHT':
      if (!entities.light) throw new Error('Control mapping is unavailable.');
      return { domain: 'select', service: 'select_option', data: { entity_id: entities.light, option: command.light } };
    case 'COWAY_SET_BUTTON_LOCK':
      if (!entities.buttonLock) throw new Error('Control mapping is unavailable.');
      return { domain: 'switch', service: command.locked ? 'turn_on' : 'turn_off', data: { entity_id: entities.buttonLock } };
    case 'COWAY_SET_SENSITIVITY':
      if (!entities.sensitivity) throw new Error('Control mapping is unavailable.');
      return { domain: 'select', service: 'select_option', data: { entity_id: entities.sensitivity, option: command.sensitivity } };
  }
}

export type HomeAssistantActionFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean }>;

export class HomeAssistantActionExecutor implements IndoorActionExecutor {
  constructor(
    private readonly server: string,
    private readonly token: string,
    private readonly mapping: HomeAssistantControlMap,
    private readonly fetcher: HomeAssistantActionFetch,
  ) {}

  async execute(command: IndoorCommand) {
    const call = service(command, this.mapping);
    const response = await this.fetcher(`${this.server.replace(/\/$/, '')}/api/services/${call.domain}/${call.service}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(call.data),
    });
    if (!response.ok) throw new Error('Home Assistant action failed.');
  }
}
