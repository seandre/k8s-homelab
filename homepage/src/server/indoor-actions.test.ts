import { describe, expect, it, vi } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { indoorVentilationStateVersion, type IndoorCommand } from '../shared/contracts.js';
import { IndoorActionGateway, type ActionContext } from './indoor-actions.js';

const context: ActionContext = {
  sourceIp: '192.168.20.42', origin: 'https://homepage.lab.seandre.dev',
  host: 'homepage.lab.seandre.dev', forwardedProto: 'https',
  fetchSite: 'same-origin', fetchMode: 'cors', contentType: 'application/json',
};
const request = {
  idempotencyKey: '6d594f25-99b9-4b64-a244-b3400c167b9d',
  expectedStateVersion: 'fixture-coway-living-1',
  confirmed: true,
  command: { type: 'COWAY_SET_POWER', target: 'coway_living_room', power: true },
} as const;

function fixture() {
  const state = structuredClone(healthyBootstrapFixture);
  state.indoor.purifiers[0].sourceState = 'AVAILABLE';
  state.indoor.purifiers[0].stateVersion = request.expectedStateVersion;
  state.indoor.purifiers[0].power = false;
  return state;
}

function airgradientFixture() {
  const state = structuredClone(healthyBootstrapFixture);
  const target = state.indoor.sensors[1];
  target.sourceState = 'AVAILABLE';
  target.stateVersion = 'fixture-airgradient-control-1';
  target.settings.displayBrightness = 80;
  target.settings.ledBrightness = 60;
  target.settings.displayTemperatureUnit = 'fahrenheit';
  target.settings.pmStandard = 'us_aqi';
  target.settings.ledMode = 'co2';
  target.capabilities.displayBrightness.supported = true;
  target.capabilities.ledBrightness.supported = true;
  target.capabilities.displayTemperatureUnits = { supported: true, options: ['celsius', 'fahrenheit'], dependency: 'AIRGRADIENT_LOCAL' };
  target.capabilities.pmStandards = { supported: true, options: ['ugm3', 'us_aqi'], dependency: 'AIRGRADIENT_LOCAL' };
  target.capabilities.ledModes = { supported: true, options: ['co2', 'pm', 'off'], dependency: 'AIRGRADIENT_LOCAL' };
  return state;
}

describe('indoor action gateway', () => {
  it('accepts once, waits for observed convergence, and emits a redacted normalized audit', async () => {
    const state = fixture();
    const audit = vi.fn();
    const execute = vi.fn(async () => { state.indoor.purifiers[0].power = true; });
    const gateway = new IndoorActionGateway(() => state, { execute }, audit, () => new Date('2026-07-24T12:00:00Z'), async () => {}, 1, 10);
    const first = await gateway.accept(request, context);
    expect(first).toMatchObject({ ok: true, replay: false, action: { target: 'coway_living_room', status: 'PENDING' } });
    expect(await gateway.accept(request, context)).toMatchObject({ ok: true, replay: true });
    await vi.waitFor(() => expect(gateway.statuses()[0]?.status).toBe('SUCCEEDED'));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      target: 'coway_living_room', command: 'COWAY_SET_POWER', oldState: { power: false },
      requestedState: { power: true }, result: 'SUCCEEDED',
    }));
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/entity_id|sensor\.|token|authorization/i);
  });

  it('confirms a Nest fan-off command when the observed timer becomes null', async () => {
    const state = structuredClone(healthyBootstrapFixture);
    const thermostat = state.indoor.thermostats[0];
    thermostat.sourceState = 'AVAILABLE';
    thermostat.fanTimerEndsAt = '2026-07-24T12:15:00.000Z';
    const executor = {
      execute: vi.fn(async () => {
        thermostat.fanTimerEndsAt = null;
      }),
    };
    const gateway = new IndoorActionGateway(
      () => state,
      executor,
      () => {},
      () => new Date('2026-07-24T12:00:00Z'),
      async () => {},
      1,
      10,
    );
    expect(await gateway.accept({
      idempotencyKey: '9be17e2c-4744-48fa-bf78-a67653b8626e',
      expectedStateVersion: thermostat.stateVersion,
      confirmed: true,
      command: { type: 'NEST_SET_FAN_TIMER', target: 'nest_living_room', durationMinutes: 0 },
    }, context)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(gateway.statuses()[0]?.status).toBe('SUCCEEDED'));
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed for source, origin, confirmation, stale state, unavailable source, and capability', async () => {
    const executor = { execute: vi.fn(async () => {}) };
    const make = (state = fixture()) => new IndoorActionGateway(() => state, executor, () => {});
    expect(await make().accept(request, { ...context, sourceIp: '192.168.30.9' })).toMatchObject({ ok: false, code: 'FORBIDDEN_SOURCE' });
    expect(await make().accept(request, { ...context, origin: 'https://evil.test' })).toMatchObject({ ok: false, code: 'FORBIDDEN_ORIGIN' });
    expect(await make().accept({ ...request, confirmed: false }, context)).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await make().accept({ ...request, expectedStateVersion: 'old' }, context)).toMatchObject({ ok: false, code: 'STATE_CONFLICT' });
    const unavailable = fixture(); unavailable.indoor.purifiers[0].sourceState = 'UNAVAILABLE';
    expect(await make(unavailable).accept(request, context)).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
    expect(await make().accept({ ...request, command: { type: 'COWAY_SET_TIMER', target: 'coway_living_room', durationMinutes: 13 } }, context)).toMatchObject({ ok: false, code: 'UNSUPPORTED_COMMAND' });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('times out without optimistic state and marks cloud failures failed', async () => {
    let clock = Date.parse('2026-07-24T12:00:00Z');
    const state = fixture();
    const timed = new IndoorActionGateway(() => state, { execute: async () => {} }, () => {}, () => new Date(clock), async (ms) => { clock += ms; }, 5, 10);
    await timed.accept(request, context);
    await vi.waitFor(() => expect(timed.statuses()[0]?.status).toBe('TIMED_OUT'));
    expect(state.indoor.purifiers[0].power).toBe(false);

    const failed = new IndoorActionGateway(() => fixture(), { execute: async () => { throw new Error('cloud token=private'); } }, () => {}, () => new Date(), async () => {});
    await failed.accept({ ...request, idempotencyKey: '44e33378-c152-43cd-8d50-371682ec14ba' }, context);
    await vi.waitFor(() => expect(failed.statuses()[0]).toMatchObject({ status: 'FAILED', message: 'The source could not complete the action.' }));
  });

  it('rate limits all attempts and accepts the Teleport source range', async () => {
    const gateway = new IndoorActionGateway(() => fixture(), { execute: async () => {} }, () => {});
    for (let index = 0; index < 10; index += 1) await gateway.accept({}, { ...context, sourceIp: '192.168.2.4' });
    expect(await gateway.accept({}, { ...context, sourceIp: '192.168.2.4' })).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });

  it('enforces AirGradient capabilities, convergence, replay, stale state, and redacted audit', async () => {
    const state = airgradientFixture();
    const audit = vi.fn();
    const command = { type: 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS', target: 'airgradient_living_room', value: 75 } as const;
    const input = {
      idempotencyKey: '97540632-ea31-4d61-9db5-b5fd6d27793e',
      expectedStateVersion: state.indoor.sensors[1].stateVersion,
      confirmed: true,
      command,
    } as const;
    const executor = { execute: vi.fn(async () => { state.indoor.sensors[1].settings.displayBrightness = 75; }) };
    const gateway = new IndoorActionGateway(() => state, executor, audit, () => new Date('2026-07-24T12:00:00Z'), async () => {}, 1, 10);
    expect(await gateway.accept(input, context)).toMatchObject({ ok: true, replay: false, action: { target: 'airgradient_living_room' } });
    expect(await gateway.accept(input, context)).toMatchObject({ ok: true, replay: true });
    await vi.waitFor(() => expect(gateway.statuses()[0]?.status).toBe('SUCCEEDED'));
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      target: 'airgradient_living_room',
      command: 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS',
      oldState: { displayBrightness: 80 },
      requestedState: { displayBrightness: 75 },
      result: 'SUCCEEDED',
    }));
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/entity_id|token|authorization|number\.|select\./i);

    const stale = airgradientFixture();
    stale.indoor.sensors[1].sourceState = 'DEGRADED';
    expect(await new IndoorActionGateway(() => stale, executor, () => {}).accept({ ...input, idempotencyKey: '168421b6-bbfd-4cf9-a661-b96da9e6c92a' }, context)).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
    expect(await new IndoorActionGateway(() => airgradientFixture(), executor, () => {}).accept({
      ...input,
      idempotencyKey: '442ef0ef-f366-468e-a118-a10508fc2d5b',
      command: { type: 'AIRGRADIENT_SET_LED_MODE', target: 'airgradient_living_room', option: 'calibrate' },
    }, context)).toMatchObject({ ok: false, code: 'UNSUPPORTED_COMMAND' });
  });

  it('ventilates for 30 minutes, restores unchanged devices, and preserves per-device overrides', async () => {
    let clock = Date.parse('2026-07-24T12:00:00Z');
    let waits = 0;
    const state = structuredClone(healthyBootstrapFixture);
    const calls: IndoorCommand[] = [];
    const audit = vi.fn();
    const executor = {
      execute: vi.fn(async (command: IndoorCommand) => {
        calls.push(command);
        if (command.type === 'NEST_SET_FAN_TIMER') {
          state.indoor.thermostats[0].fanTimerEndsAt = command.durationMinutes > 0
            ? new Date(clock + command.durationMinutes * 60_000).toISOString()
            : null;
          state.indoor.thermostats[0].stateVersion = `nest-${command.durationMinutes}`;
        }
        if (command.type === 'COWAY_SET_SPEED') {
          const target = state.indoor.purifiers.find((purifier) => purifier.alias === command.target)!;
          target.power = true;
          target.preset = null;
          target.speed = command.speed;
          target.stateVersion = `${command.target}-speed-${command.speed}`;
        }
        if (command.type === 'COWAY_SET_PRESET') {
          const target = state.indoor.purifiers.find((purifier) => purifier.alias === command.target)!;
          target.preset = command.preset;
          target.speed = command.preset === 'RAPID' ? 3 : 2;
          target.stateVersion = `${command.target}-preset-${command.preset}`;
        }
        if (command.type === 'COWAY_SET_POWER') {
          const target = state.indoor.purifiers.find((purifier) => purifier.alias === command.target)!;
          target.power = command.power;
          target.stateVersion = `${command.target}-power-${command.power}`;
        }
      }),
    };
    const gateway = new IndoorActionGateway(
      () => state,
      executor,
      audit,
      () => new Date(clock),
      async (ms) => {
        clock += ms;
        waits += 1;
        if (waits === 1) {
          const living = state.indoor.purifiers[0];
          living.speed = 1;
          living.preset = 'AUTO';
          living.stateVersion = 'living-cloud-auto-fallback';
        }
        if (waits === 2) {
          const bedroom = state.indoor.purifiers[1];
          bedroom.speed = 1;
          bedroom.preset = null;
          bedroom.stateVersion = 'bedroom-manual-override';
        }
      },
      10_000,
      10,
      undefined,
      30_000,
    );
    const input = {
      idempotencyKey: '25c24d27-eed3-4d09-b188-9cffc60c2cce',
      expectedStateVersion: indoorVentilationStateVersion(state.indoor),
      confirmed: true,
      command: { type: 'VENTILATE', target: 'indoor_environment', durationMinutes: 30 },
    } as const;

    expect(await gateway.accept(input, context)).toMatchObject({
      ok: true,
      action: { target: 'indoor_environment', status: 'PENDING' },
    });
    await vi.waitFor(() => expect(gateway.statuses()[0]?.status).toBe('SUCCEEDED'));

    expect(state.indoor.thermostats[0].fanTimerEndsAt).toBeNull();
    expect(state.indoor.purifiers[0]).toMatchObject({ power: true, preset: 'AUTO', speed: 2 });
    expect(state.indoor.purifiers[1]).toMatchObject({ power: true, preset: null, speed: 1 });
    expect(calls).toContainEqual({ type: 'COWAY_SET_PRESET', target: 'coway_living_room', preset: 'RAPID' });
    expect(calls.filter((command) => command.type === 'COWAY_SET_PRESET'
      && command.target === 'coway_living_room' && command.preset === 'RAPID')).toHaveLength(2);
    expect(calls).toContainEqual({ type: 'COWAY_SET_PRESET', target: 'coway_bedroom', preset: 'RAPID' });
    expect(calls).not.toContainEqual({ type: 'COWAY_SET_PRESET', target: 'coway_bedroom', preset: 'AUTO' });
    expect(gateway.statuses()[0]?.message).toContain('coway bedroom');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      target: 'indoor_environment',
      command: 'VENTILATE',
      overriddenTargets: ['coway_bedroom'],
      result: 'SUCCEEDED',
    }));
  });

  it('cancels an active ventilation cycle and restores the saved fan states', async () => {
    let clock = Date.parse('2026-07-24T12:00:00Z');
    let releaseWait: (() => void) | undefined;
    const state = structuredClone(healthyBootstrapFixture);
    const executor = {
      execute: vi.fn(async (command: IndoorCommand) => {
        if (command.type === 'NEST_SET_FAN_TIMER') {
          state.indoor.thermostats[0].fanTimerEndsAt = command.durationMinutes > 0
            ? new Date(clock + command.durationMinutes * 60_000).toISOString()
            : null;
        }
        if (command.type === 'COWAY_SET_PRESET') {
          const target = state.indoor.purifiers.find((purifier) => purifier.alias === command.target)!;
          target.power = true;
          target.preset = command.preset;
          target.speed = command.preset === 'RAPID' ? null : 2;
        }
        if (command.type === 'COWAY_SET_POWER') {
          state.indoor.purifiers.find((purifier) => purifier.alias === command.target)!.power = command.power;
        }
      }),
    };
    const gateway = new IndoorActionGateway(
      () => state,
      executor,
      () => {},
      () => new Date(clock),
      async (ms) => new Promise<void>((resolve) => {
        releaseWait = () => { clock += ms; resolve(); };
      }),
      2_000,
      30_000,
      undefined,
      30 * 60_000,
    );
    expect(await gateway.accept({
      idempotencyKey: 'a9abe324-afc2-466d-82a7-5c8cd4833cef',
      expectedStateVersion: indoorVentilationStateVersion(state.indoor),
      confirmed: true,
      command: { type: 'VENTILATE', target: 'indoor_environment', durationMinutes: 30 },
    }, context)).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(gateway.statuses()[0]?.message).toContain('Ventilating for 30 minutes'));
    expect(gateway.statuses()[0]?.endsAt).toBe('2026-07-24T12:30:00.000Z');

    expect(await gateway.accept({
      idempotencyKey: '89b93e06-702f-442b-92c5-74a5a0d777d2',
      expectedStateVersion: indoorVentilationStateVersion(state.indoor),
      confirmed: true,
      command: { type: 'CANCEL_VENTILATION', target: 'indoor_environment' },
    }, context)).toMatchObject({ ok: true });
    releaseWait?.();
    await vi.waitFor(() => expect(gateway.statuses()[0]).toMatchObject({
      status: 'SUCCEEDED',
      message: 'Cancelled; prior fan states were restored.',
    }));
    expect(state.indoor.thermostats[0].fanTimerEndsAt).toBeNull();
    expect(state.indoor.purifiers[0].preset).toBe('AUTO');
    expect(state.indoor.purifiers[1].preset).toBe('AUTO');
  });

  it('fails Ventilate closed unless all three controls are available and rejects a second run', async () => {
    const unavailable = fixture();
    unavailable.indoor.thermostats[0].sourceState = 'UNAVAILABLE';
    const command = { type: 'VENTILATE', target: 'indoor_environment', durationMinutes: 30 } as const;
    const input = {
      idempotencyKey: '1161dd3d-bff4-4037-b9cb-bd8b7c111507',
      expectedStateVersion: indoorVentilationStateVersion(unavailable.indoor),
      confirmed: true,
      command,
    } as const;
    const gateway = new IndoorActionGateway(() => unavailable, { execute: vi.fn(async () => {}) }, () => {});
    expect(await gateway.accept(input, context)).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });

    const available = structuredClone(healthyBootstrapFixture);
    const busy = new IndoorActionGateway(
      () => available,
      { execute: vi.fn(async () => {}) },
      () => {},
      () => new Date('2026-07-24T12:00:00Z'),
      () => new Promise<void>(() => {}),
    );
    const first = {
      ...input,
      idempotencyKey: 'a1871a48-ad65-4304-858b-78ad6d977f49',
      expectedStateVersion: indoorVentilationStateVersion(available.indoor),
    };
    expect(await busy.accept(first, context)).toMatchObject({ ok: true });
    expect(await busy.accept({ ...first, idempotencyKey: '149f4e21-e43f-44a0-9057-3929f484ddbe' }, context)).toMatchObject({ ok: false, code: 'TARGET_BUSY' });
  });
});
