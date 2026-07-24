import { describe, expect, it, vi } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
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
});
