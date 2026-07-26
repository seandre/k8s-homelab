import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { buildGlobalAlertItems } from './global-alerts.js';

describe('global alert destinations', () => {
  it('includes stale weather and maps every active source to a fixed local panel', () => {
    const bootstrap = structuredClone(healthyBootstrapFixture);
    bootstrap.alerts = [];
    bootstrap.weather.conditionsMetadata = {
      ...bootstrap.weather.conditionsMetadata,
      severity: 'WARN',
      freshness: 'STALE',
      message: 'Weather data is stale.',
    };
    const items = buildGlobalAlertItems(bootstrap);
    expect(items).toContainEqual(expect.objectContaining({
      name: 'Weather conditions',
      severity: 'WARN',
      summary: 'Weather data is stale.',
      href: '/weather#weather-conditions',
    }));
    expect(items.every((item) => item.href.startsWith('/'))).toBe(true);
  });

  it('maps Alertmanager records to the closest known panel and excludes neutral planned sources', () => {
    const items = buildGlobalAlertItems(healthyBootstrapFixture);
    expect(items.find((item) => item.id === 'alert-alert-k3s-worker-warning')).toMatchObject({
      href: '/kubernetes#k3s-health-title',
      severity: 'WARN',
    });
    expect(items.some((item) => item.summary.includes('planned but inactive'))).toBe(false);
  });
});
