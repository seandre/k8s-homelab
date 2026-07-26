import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  IndoorActionAcceptedSchema, IndoorActionRequestSchema, IndoorActionStatusSchema, IndoorCommandSchema, type Bootstrap, type IndoorActionAccepted,
  type IndoorActionStatus, type IndoorCommand, type IndoorState,
} from '../shared/contracts.js';

export type ActionResult =
  | { ok: true; action: IndoorActionAccepted; replay: boolean }
  | { ok: false; statusCode: number; code: string; message: string };

export interface ActionContext {
  sourceIp: string;
  origin?: string | undefined;
  host?: string | undefined;
  forwardedHost?: string | undefined;
  forwardedProto?: string | undefined;
  fetchSite?: string | undefined;
  fetchMode?: string | undefined;
  contentType?: string | undefined;
}

export interface IndoorActionExecutor {
  execute(command: IndoorCommand): Promise<void>;
}

interface StoredAction {
  key: string;
  accepted: IndoorActionAccepted;
  status: IndoorActionStatus;
  command: IndoorCommand;
  oldState: unknown;
  requestedState: unknown;
  expiresAt: number;
}
const StoredActionSchema = IndoorActionStatusSchema.extend({
  key: z.string().uuid(),
  command: IndoorCommandSchema,
  oldState: z.unknown(),
  requestedState: z.unknown(),
  expiresAt: z.number().int().positive(),
}).strict();
type PersistedAction = z.infer<typeof StoredActionSchema>;

export interface ActionPersistence {
  load(): Promise<unknown>;
  save(actions: PersistedAction[]): Promise<void>;
}

const SAFE_MESSAGE: Record<string, string> = {
  INVALID_REQUEST: 'The action request is invalid.',
  FORBIDDEN_SOURCE: 'The action is not allowed from this network path.',
  FORBIDDEN_ORIGIN: 'The action must originate from this dashboard.',
  RATE_LIMITED: 'Too many action requests. Try again shortly.',
  STATE_CONFLICT: 'The target changed. Refresh and review the action again.',
  SOURCE_UNAVAILABLE: 'The target source is not currently available.',
  UNSUPPORTED_COMMAND: 'The target does not advertise this command or value.',
  TARGET_BUSY: 'The target already has the maximum number of pending actions.',
};

function reject(statusCode: number, code: keyof typeof SAFE_MESSAGE): ActionResult {
  return { ok: false, statusCode, code, message: SAFE_MESSAGE[code]! };
}

function inCidr(ip: string, prefix: string) {
  return ip.startsWith(prefix);
}

function requested(command: IndoorCommand): unknown {
  switch (command.type) {
    case 'NEST_SET_HVAC_MODE': return { hvacMode: command.mode };
    case 'NEST_SET_SETPOINT': return command.setpoint;
    case 'NEST_SET_FAN_TIMER': return { fanTimerMinutes: command.durationMinutes };
    case 'COWAY_SET_POWER': return { power: command.power };
    case 'COWAY_SET_PRESET': return { preset: command.preset };
    case 'COWAY_SET_SPEED': return { speed: command.speed };
    case 'COWAY_SET_TIMER': return { timerMinutes: command.durationMinutes };
    case 'COWAY_SET_LIGHT': return { light: command.light };
    case 'COWAY_SET_BUTTON_LOCK': return { buttonLock: command.locked };
    case 'COWAY_SET_SENSITIVITY': return { sensitivity: command.sensitivity };
    case 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS': return { displayBrightness: command.value };
    case 'AIRGRADIENT_SET_LED_BRIGHTNESS': return { ledBrightness: command.value };
    case 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT': return { displayTemperatureUnit: command.option };
    case 'AIRGRADIENT_SET_PM_STANDARD': return { pmStandard: command.option };
    case 'AIRGRADIENT_SET_LED_MODE': return { ledMode: command.option };
  }
}

function oldState(indoor: IndoorState, command: IndoorCommand): unknown {
  switch (command.type) {
    case 'NEST_SET_HVAC_MODE': return { hvacMode: indoor.thermostats[0].hvacMode };
    case 'NEST_SET_SETPOINT': return { heatSetpointF: indoor.thermostats[0].heatSetpointF, coolSetpointF: indoor.thermostats[0].coolSetpointF };
    case 'NEST_SET_FAN_TIMER': return { fanTimerEndsAt: indoor.thermostats[0].fanTimerEndsAt };
    case 'COWAY_SET_POWER': return { power: indoor.purifiers.find((item) => item.alias === command.target)!.power };
    case 'COWAY_SET_PRESET': return { preset: indoor.purifiers.find((item) => item.alias === command.target)!.preset };
    case 'COWAY_SET_SPEED': return { speed: indoor.purifiers.find((item) => item.alias === command.target)!.speed };
    case 'COWAY_SET_TIMER': return { timerEndsAt: indoor.purifiers.find((item) => item.alias === command.target)!.timerEndsAt };
    case 'COWAY_SET_LIGHT': return { light: indoor.purifiers.find((item) => item.alias === command.target)!.light };
    case 'COWAY_SET_BUTTON_LOCK': return { buttonLock: indoor.purifiers.find((item) => item.alias === command.target)!.buttonLock };
    case 'COWAY_SET_SENSITIVITY': return { sensitivity: indoor.purifiers.find((item) => item.alias === command.target)!.sensitivity };
    case 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS': return { displayBrightness: indoor.sensors[1].settings.displayBrightness };
    case 'AIRGRADIENT_SET_LED_BRIGHTNESS': return { ledBrightness: indoor.sensors[1].settings.ledBrightness };
    case 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT': return { displayTemperatureUnit: indoor.sensors[1].settings.displayTemperatureUnit };
    case 'AIRGRADIENT_SET_PM_STANDARD': return { pmStandard: indoor.sensors[1].settings.pmStandard };
    case 'AIRGRADIENT_SET_LED_MODE': return { ledMode: indoor.sensors[1].settings.ledMode };
  }
}

function supported(indoor: IndoorState, command: IndoorCommand) {
  if (command.target === 'airgradient_living_room') {
    const target = indoor.sensors[1];
    switch (command.type) {
      case 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS': {
        const cap = target.capabilities.displayBrightness;
        return cap.supported && command.value >= cap.min && command.value <= cap.max && (command.value - cap.min) % cap.step === 0;
      }
      case 'AIRGRADIENT_SET_LED_BRIGHTNESS': {
        const cap = target.capabilities.ledBrightness;
        return cap.supported && command.value >= cap.min && command.value <= cap.max && (command.value - cap.min) % cap.step === 0;
      }
      case 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT': return target.capabilities.displayTemperatureUnits.supported && target.capabilities.displayTemperatureUnits.options.includes(command.option);
      case 'AIRGRADIENT_SET_PM_STANDARD': return target.capabilities.pmStandards.supported && target.capabilities.pmStandards.options.includes(command.option);
      case 'AIRGRADIENT_SET_LED_MODE': return target.capabilities.ledModes.supported && target.capabilities.ledModes.options.includes(command.option);
      default: return false;
    }
  }
  if (command.target === 'nest_living_room') {
    const target = indoor.thermostats[0];
    if (command.type === 'NEST_SET_HVAC_MODE') return target.capabilities.hvacModes.supported && target.capabilities.hvacModes.options.includes(command.mode);
    if (command.type === 'NEST_SET_FAN_TIMER') return target.capabilities.fanTimerMinutes.supported && target.capabilities.fanTimerMinutes.values.includes(command.durationMinutes);
    if (command.type === 'NEST_SET_SETPOINT') {
      const { setpoint } = command;
      const values = setpoint.shape === 'RANGE' ? [setpoint.heatTemperatureF, setpoint.coolTemperatureF] : [setpoint.temperatureF];
      const min = target.capabilities.setpointMinF;
      const max = target.capabilities.setpointMaxF;
      const step = target.capabilities.setpointStepF;
      return target.capabilities.setpointShapes.includes(setpoint.shape) && min !== null && max !== null && step !== null
        && values.every((value) => value >= min && value <= max && Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-9)
        && (setpoint.shape !== 'RANGE' || setpoint.heatTemperatureF < setpoint.coolTemperatureF);
    }
    return false;
  }
  const target = indoor.purifiers.find((item) => item.alias === command.target);
  if (!target) return false;
  switch (command.type) {
    case 'COWAY_SET_POWER': return target.capabilities.power.supported;
    case 'COWAY_SET_PRESET': return target.capabilities.presets.supported && target.capabilities.presets.options.includes(command.preset);
    case 'COWAY_SET_SPEED': return target.capabilities.speeds.supported && target.capabilities.speeds.values.includes(command.speed);
    case 'COWAY_SET_TIMER': return target.capabilities.timerMinutes.supported && target.capabilities.timerMinutes.values.includes(command.durationMinutes);
    case 'COWAY_SET_LIGHT': return target.capabilities.lightOptions.supported && target.capabilities.lightOptions.options.includes(command.light);
    case 'COWAY_SET_BUTTON_LOCK': return target.capabilities.buttonLock.supported;
    case 'COWAY_SET_SENSITIVITY': return target.capabilities.sensitivityOptions.supported && target.capabilities.sensitivityOptions.options.includes(command.sensitivity);
    default: return false;
  }
}

function converged(indoor: IndoorState, command: IndoorCommand, acceptedAt: Date) {
  if (command.target === 'airgradient_living_room') {
    const settings = indoor.sensors[1].settings;
    switch (command.type) {
      case 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS': return settings.displayBrightness === command.value;
      case 'AIRGRADIENT_SET_LED_BRIGHTNESS': return settings.ledBrightness === command.value;
      case 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT': return settings.displayTemperatureUnit === command.option;
      case 'AIRGRADIENT_SET_PM_STANDARD': return settings.pmStandard === command.option;
      case 'AIRGRADIENT_SET_LED_MODE': return settings.ledMode === command.option;
      default: return false;
    }
  }
  if (command.target === 'nest_living_room') {
    const target = indoor.thermostats[0];
    if (command.type === 'NEST_SET_HVAC_MODE') return target.hvacMode === command.mode;
    if (command.type === 'NEST_SET_SETPOINT') {
      const s = command.setpoint;
      return s.shape === 'HEAT' ? target.heatSetpointF === s.temperatureF
        : s.shape === 'COOL' ? target.coolSetpointF === s.temperatureF
        : target.heatSetpointF === s.heatTemperatureF && target.coolSetpointF === s.coolTemperatureF;
    }
    return target.fanTimerEndsAt !== null && (command.durationMinutes === 0
      ? Date.parse(target.fanTimerEndsAt) <= acceptedAt.getTime()
      : Date.parse(target.fanTimerEndsAt) >= acceptedAt.getTime() + (command.durationMinutes - 2) * 60_000);
  }
  const target = indoor.purifiers.find((item) => item.alias === command.target)!;
  switch (command.type) {
    case 'COWAY_SET_POWER': return target.power === command.power;
    case 'COWAY_SET_PRESET': return target.preset === command.preset;
    case 'COWAY_SET_SPEED': return target.speed === command.speed;
    case 'COWAY_SET_TIMER': return command.durationMinutes === 0 ? target.timerEndsAt === null : target.timerEndsAt !== null;
    case 'COWAY_SET_LIGHT': return target.light === command.light;
    case 'COWAY_SET_BUTTON_LOCK': return target.buttonLock === command.locked;
    case 'COWAY_SET_SENSITIVITY': return target.sensitivity === command.sensitivity;
  }
}

export class IndoorActionGateway {
  private readonly actions = new Map<string, StoredAction>();
  private readonly rate = new Map<string, number[]>();
  private readonly running = new Set<string>();
  private readonly ready: Promise<void>;

  constructor(
    private readonly bootstrap: () => Bootstrap | Promise<Bootstrap>,
    private readonly executor: IndoorActionExecutor,
    private readonly audit: (fields: Record<string, unknown>) => void,
    private readonly now: () => Date = () => new Date(),
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly pollMs = 2_000,
    private readonly timeoutMs = 30_000,
    private readonly persistence?: ActionPersistence,
  ) {
    this.ready = this.restore();
  }

  private async restore() {
    if (!this.persistence) return;
    try {
      const parsed = z.array(StoredActionSchema).safeParse(await this.persistence.load());
      if (!parsed.success) return;
      const now = this.now().getTime();
      for (const item of parsed.data) {
        if (item.expiresAt <= now) continue;
        const accepted = IndoorActionAcceptedSchema.parse({ actionId: item.actionId, target: item.target, status: 'PENDING', acceptedAt: item.acceptedAt });
        const restoredStatus = item.status === 'PENDING'
          ? { ...accepted, status: 'FAILED' as const, resolvedAt: this.now().toISOString(), message: 'The gateway restarted before confirmation.' }
          : IndoorActionStatusSchema.parse(item);
        this.actions.set(item.key, {
          key: item.key, accepted, status: restoredStatus, command: item.command,
          oldState: item.oldState, requestedState: item.requestedState, expiresAt: item.expiresAt,
        });
      }
    } catch {
      // A corrupt or missing optional store fails closed to an empty replay
      // cache; it never becomes action input.
    }
  }

  private async persist() {
    if (!this.persistence) return;
    await this.persistence.save([...this.actions.values()].map((item) => ({
      ...item.status, key: item.key, command: item.command, oldState: item.oldState,
      requestedState: item.requestedState, expiresAt: item.expiresAt,
    })));
  }

  statuses() {
    return [...this.actions.values()].map(({ status }) => status).slice(-100);
  }

  async accept(input: unknown, context: ActionContext): Promise<ActionResult> {
    await this.ready;
    const now = this.now().getTime();
    for (const [key, value] of this.actions) if (value.expiresAt <= now) this.actions.delete(key);
    const attempts = (this.rate.get(context.sourceIp) ?? []).filter((time) => time > now - 60_000);
    attempts.push(now);
    this.rate.set(context.sourceIp, attempts);
    if (attempts.length > 10) return reject(429, 'RATE_LIMITED');
    if (!(inCidr(context.sourceIp, '192.168.20.') || inCidr(context.sourceIp, '192.168.2.'))) return reject(403, 'FORBIDDEN_SOURCE');
    const expectedOrigin = `${context.forwardedProto ?? 'https'}://${context.forwardedHost ?? context.host ?? ''}`;
    if (!context.origin || context.origin !== expectedOrigin || context.fetchSite !== 'same-origin' || !['cors', 'same-origin'].includes(context.fetchMode ?? '') || context.contentType?.split(';')[0] !== 'application/json') {
      return reject(403, 'FORBIDDEN_ORIGIN');
    }
    const parsed = IndoorActionRequestSchema.safeParse(input);
    if (!parsed.success) return reject(400, 'INVALID_REQUEST');
    const prior = this.actions.get(parsed.data.idempotencyKey);
    if (prior) return { ok: true, action: prior.accepted, replay: true };
    const snapshot = (await this.bootstrap()).indoor;
    const target = parsed.data.command.target === 'nest_living_room' ? snapshot.thermostats[0]
      : parsed.data.command.target === 'airgradient_living_room' ? snapshot.sensors[1]
      : snapshot.purifiers.find((item) => item.alias === parsed.data.command.target);
    if (!target || target.stateVersion !== parsed.data.expectedStateVersion) return reject(409, 'STATE_CONFLICT');
    if (target.sourceState !== 'AVAILABLE') return reject(409, 'SOURCE_UNAVAILABLE');
    if (!supported(snapshot, parsed.data.command)) return reject(422, 'UNSUPPORTED_COMMAND');
    if ([...this.actions.values()].filter((item) => item.command.target === target.alias && item.status.status === 'PENDING').length >= 2 || this.running.has(target.alias)) return reject(409, 'TARGET_BUSY');
    const acceptedAt = this.now().toISOString();
    const accepted: IndoorActionAccepted = { actionId: randomUUID(), target: target.alias, status: 'PENDING', acceptedAt };
    const stored: StoredAction = {
      key: parsed.data.idempotencyKey, accepted, command: parsed.data.command,
      status: { ...accepted, resolvedAt: null }, oldState: oldState(snapshot, parsed.data.command),
      requestedState: requested(parsed.data.command), expiresAt: now + 86_400_000,
    };
    this.actions.set(stored.key, stored);
    try { await this.persist(); } catch { this.actions.delete(stored.key); return reject(503, 'SOURCE_UNAVAILABLE'); }
    this.running.add(target.alias);
    void this.run(stored);
    return { ok: true, action: accepted, replay: false };
  }

  private async run(action: StoredAction) {
    const started = this.now().getTime();
    let result: IndoorActionStatus['status'] = 'FAILED';
    try {
      await this.executor.execute(action.command);
      while (this.now().getTime() - started < this.timeoutMs) {
        await this.wait(this.pollMs);
        const indoor = (await this.bootstrap()).indoor;
        const target = action.command.target === 'nest_living_room' ? indoor.thermostats[0]
          : action.command.target === 'airgradient_living_room' ? indoor.sensors[1]
          : indoor.purifiers.find((item) => item.alias === action.command.target);
        if (!target || target.sourceState !== 'AVAILABLE') break;
        if (converged(indoor, action.command, new Date(action.accepted.acceptedAt))) { result = 'SUCCEEDED'; break; }
        result = 'TIMED_OUT';
      }
    } catch {
      result = 'FAILED';
    } finally {
      const resolvedAt = this.now().toISOString();
      action.status = { ...action.accepted, status: result, resolvedAt, ...(result === 'SUCCEEDED' ? {} : { message: result === 'TIMED_OUT' ? 'The target did not confirm the requested state in time.' : 'The source could not complete the action.' }) };
      this.running.delete(action.command.target);
      try { await this.persist(); } catch { /* audit still records the terminal device result */ }
      this.audit({
        actionId: action.accepted.actionId, target: action.command.target, command: action.command.type,
        oldState: action.oldState, requestedState: action.requestedState,
        latencyMs: Math.max(0, this.now().getTime() - started), result,
      });
    }
  }
}
