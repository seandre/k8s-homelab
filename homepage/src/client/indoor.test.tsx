import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { unsupportedIndoorFixture } from '../shared/indoor-fixtures.js';
import { computeHistoryDomain, nextHistoryRefreshDelay } from './indoor-chart.js';
import { HistoryGraph, IndoorOverviewCard, IndoorScreen } from './indoor.js';

describe('indoor dashboard', () => {
  it('renders normalized readings, both purifiers, history windows, and capability controls', () => {
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={healthyBootstrapFixture} />);
    expect(markup).toContain('Living Room environment');
    expect(markup).toContain('Living Room Coway');
    expect(markup).toContain('Bedroom Coway');
    expect(markup).toContain('Environmental trends');
    expect(markup).toContain('Loading history');
    for (const window of ['1h', '3h', '6h', '24h', '7d', '30d', 'Custom']) expect(markup).toContain(`>${window}<`);
    expect(markup).toContain('HVAC mode');
    expect(markup).toContain('Review power off');
    expect(markup).toContain('NO DATA · CO₂');
  });

  it('aligns live history refreshes to the next 30-second scrape boundary', () => {
    expect(nextHistoryRefreshDelay(0)).toBe(30_500);
    expect(nextHistoryRefreshDelay(29_000)).toBe(1_500);
    expect(nextHistoryRefreshDelay(30_000)).toBe(30_500);
  });

  it('renders only controls advertised by capabilities', () => {
    const bootstrap = { ...healthyBootstrapFixture, indoor: unsupportedIndoorFixture };
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={bootstrap} />);
    expect(markup).not.toContain('HVAC mode');
    expect(markup).not.toContain('Review power');
    expect(markup).not.toContain('Sensitivity');
    expect(markup).toContain('UNAVAILABLE');
  });

  it('adds the compact Living Room summary to overview', () => {
    const markup = renderToStaticMarkup(<IndoorOverviewCard indoor={healthyBootstrapFixture.indoor} />);
    expect(markup).toContain('Indoor environment');
    expect(markup).toContain('WORST PM2.5');
    expect(markup).toContain('Open indoor dashboard');
    expect(markup).toContain('href="/indoor"');
  });

  it('uses compact, readable chart domains with six evenly spaced ticks', () => {
    expect(computeHistoryDomain([72.3, 76.8], { minSpan: 10 })).toEqual({
      min: 70, max: 80, step: 2, ticks: [70, 72, 74, 76, 78, 80],
    });
    expect(computeHistoryDomain([46, 52], { minSpan: 20, hardMin: 0, hardMax: 100 })).toEqual({
      min: 40, max: 60, step: 4, ticks: [40, 44, 48, 52, 56, 60],
    });
    expect(computeHistoryDomain([1, 3], { minSpan: 10, hardMin: 0 })).toEqual({
      min: 0, max: 10, step: 2, ticks: [0, 2, 4, 6, 8, 10],
    });
    expect(computeHistoryDomain([72.3, 76.8], {
      fixedMin: 60, fixedMax: 80, ticks: [60, 65, 70, 75, 80],
    })).toEqual({
      min: 60, max: 80, step: 5, ticks: [60, 65, 70, 75, 80],
    });
    expect(computeHistoryDomain([800, 1050], {
      fixedMin: 400, fixedMax: 1400, ticks: [400, 600, 800, 1000, 1200, 1400],
    })).toEqual({
      min: 400, max: 1400, step: 200, ticks: [400, 600, 800, 1000, 1200, 1400],
    });
  });

  it('renders proportional y-axis labels and real history-window endpoints', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="Temperature"
      thresholds={[{ value: 60, tone: 'blue' }, { value: 80, tone: 'red' }]}
      scale={{ fixedMin: 60, fixedMax: 80, ticks: [60, 65, 70, 75, 80] }}
      series={{
        metric: 'aranet_living_room.temperature',
        unit: '°F',
        window: '24h',
        points: [
          { timestamp: '2026-07-24T19:00:00.000Z', value: 72.5 },
          { timestamp: '2026-07-25T00:30:00.000Z', value: 76.8 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:30:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('60');
    expect(markup).toContain('80');
    expect(markup).toContain('y-axis-labels');
    expect(markup).toContain('x-axis-grid');
    expect(markup).toContain('12:00 PM');
    expect(markup).toContain('Current');
  });

  it('smooths the CO₂ trace and emphasizes visible threshold ticks', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="CO₂"
      thresholds={[{ value: 900, tone: 'yellow' }, { value: 1000, tone: 'red' }]}
      scale={{ fixedMin: 400, fixedMax: 1400, ticks: [400, 600, 800, 1000, 1200, 1400] }}
      series={{
        metric: 'aranet_living_room.co2',
        unit: 'ppm',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 700 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 900 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 1100 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('<path');
    expect(markup).toContain('history-line-smoothed');
    expect(markup).toContain('y-axis-label-threshold');
    expect(markup).toContain('threshold-tone-yellow');
    expect(markup).toContain('threshold-tone-red');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
    expect(markup).not.toContain('<circle');
  });

  it('smooths the PM2.5 trace without losing threshold-based colors', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="Living Room PM2.5"
      thresholds={[{ value: 5, tone: 'yellow' }, { value: 15, tone: 'red' }]}
      scale={{ minSpan: 20, hardMin: 0 }}
      series={{
        metric: 'coway_living_room.pm25',
        unit: 'µg/m³',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 3 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 10 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 18 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('<path');
    expect(markup).toContain('history-line-smoothed');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
  });
});
