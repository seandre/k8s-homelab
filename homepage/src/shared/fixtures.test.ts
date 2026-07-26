import { describe, expect, it } from 'vitest';
import { BootstrapSchema, FreshnessSchema, SeveritySchema } from './contracts.js';
import { healthyBootstrapFixture } from './fixtures.js';
import { partialIndoorFixture, staleIndoorFixture, unavailableIndoorFixture, unsupportedIndoorFixture } from './indoor-fixtures.js';

describe('shared contracts', () => {
  it('accepts the complete deterministic bootstrap fixture', () => {
    expect(BootstrapSchema.parse(healthyBootstrapFixture)).toEqual(healthyBootstrapFixture);
  });

  it('restricts severity and freshness to the approved values', () => {
    expect(SeveritySchema.safeParse('ERROR').success).toBe(false);
    expect(FreshnessSchema.safeParse('UNKNOWN').success).toBe(false);
    expect(FreshnessSchema.options).toEqual([
      'CURRENT',
      'STALE',
      'NO_DATA',
      'NOT_PROVISIONED',
      'NOT_SUPPORTED',
    ]);
  });

  it('rejects credential-shaped fields in the public bootstrap contract', () => {
    expect(BootstrapSchema.safeParse({ ...healthyBootstrapFixture, token: 'never' }).success).toBe(false);
    expect(BootstrapSchema.parse(healthyBootstrapFixture)).not.toHaveProperty('token');
  });

  it('requires strict bootstrap schema version 4 and normalized AirGradient state', () => {
    expect(BootstrapSchema.safeParse({ ...healthyBootstrapFixture, schemaVersion: 3 }).success).toBe(false);
    expect(healthyBootstrapFixture.schemaVersion).toBe(4);
    expect(BootstrapSchema.safeParse({ ...healthyBootstrapFixture, unexpected: true }).success).toBe(false);
    expect(BootstrapSchema.safeParse({
      ...healthyBootstrapFixture,
      indoor: { ...healthyBootstrapFixture.indoor, sensors: [healthyBootstrapFixture.indoor.sensors[0]] },
    }).success).toBe(false);
    const unknownAlias = structuredClone(healthyBootstrapFixture) as unknown as { indoor: { sensors: Array<{ alias: string }> } };
    unknownAlias.indoor.sensors[1]!.alias = 'airgradient_arbitrary';
    expect(BootstrapSchema.safeParse(unknownAlias).success).toBe(false);
    expect(healthyBootstrapFixture.indoor.sensors[1]).toMatchObject({
      alias: 'airgradient_living_room',
      dependency: 'AIRGRADIENT_LOCAL',
      capabilities: {
        displayBrightness: { min: 0, max: 100, step: 1 },
        ledBrightness: { min: 0, max: 100, step: 1 },
      },
    });
    expect(healthyBootstrapFixture.indoor.sensors[0].alias).toBe('aranet_living_room');
    expect(healthyBootstrapFixture.network.pduPower).toMatchObject({ totalWatts: 143, metadata: { freshness: 'CURRENT' } });
  });

  it('validates partial, stale, unavailable, and unsupported indoor fixtures', () => {
    for (const indoor of [partialIndoorFixture, staleIndoorFixture, unavailableIndoorFixture, unsupportedIndoorFixture]) {
      expect(BootstrapSchema.safeParse({ ...healthyBootstrapFixture, indoor }).success).toBe(true);
    }
    expect(partialIndoorFixture.thermostats[0].sourceState).toBe('UNAVAILABLE');
    expect(staleIndoorFixture.sensors[0].readings.co2.value).toBeNull();
    expect(unavailableIndoorFixture.sensors[0].readings.co2.value).toBeNull();
    expect(unsupportedIndoorFixture.purifiers[0].capabilities.power.supported).toBe(false);
  });
});
