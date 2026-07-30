import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { unsupportedIndoorFixture } from '../shared/indoor-fixtures.js';
import { computeHistoryDomain, nextHistoryRefreshDelay, ventilationTimeRemaining } from './indoor-chart.js';
import { HistoryGraph, IndoorOverviewCard, IndoorScreen } from './indoor.js';

describe('indoor dashboard', () => {
  it('uses the defined green theme token for active controls', () => {
    const stylesheet = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(stylesheet).not.toContain('var(--ok)');
    expect(stylesheet).toMatch(/control-current-positive[^}]+color-mix\(in srgb, var\(--focus\) 18%, var\(--surface\)\)/);
    expect(stylesheet).toMatch(/ventilate-button-active[^}]+color-mix\(in srgb, var\(--focus\) 18%, var\(--surface\)\)/);
    expect(stylesheet).toMatch(/nest-setpoint-track \{[^}]+height: 0\.5rem/);
    expect(stylesheet).toMatch(/indoor-slider-thumb \{[^}]+width: 1\.5rem; height: 1rem/);
    expect(stylesheet).toMatch(/indoor-slider-thumb \{[^}]+font: 700 0\.5rem\/1/);
    expect(stylesheet).toMatch(/nest-setpoint-thumb \{ font-weight: 500; \}/);
    expect(stylesheet).toMatch(/nest-setpoint-track-inactive \{ filter: grayscale\(1\) saturate\(0\); \}/);
  });

  it('formats the ventilation countdown as zero-padded minutes and seconds', () => {
    expect(ventilationTimeRemaining('2026-07-28T12:30:00.000Z', Date.parse('2026-07-28T12:00:01.000Z'))).toBe('29:59');
    expect(ventilationTimeRemaining('2026-07-28T12:00:00.000Z', Date.parse('2026-07-28T12:00:01.000Z'))).toBe('00:00');
  });

  it('renders normalized readings, both purifiers, history windows, and capability controls', () => {
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={healthyBootstrapFixture} />);
    expect(markup).toContain('aria-label="Indoor summary"');
    expect(markup).not.toContain('>Summary<');
    expect(markup).not.toContain('INDOOR / HOME ASSISTANT');
    expect(markup).toContain('>TEMPERATURE<');
    expect(markup).not.toContain('LIVING ROOM / LOCAL PRIMARY');
    expect(markup).toContain('>Ventilate<');
    expect(markup).not.toContain('ventilate-button-active');
    expect(markup).toContain('Living Room Aranet');
    expect(markup).toContain('Living Room Air Purifier');
    expect(markup).toContain('Bedroom Air Purifier');
    expect(markup).toContain('Living Room Air Purifier Sensor Data');
    expect(markup).toContain('Bedroom Air Purifier Sensor Data');
    expect(markup.match(/>PM2\.5</g)).toHaveLength(3);
    expect(markup.match(/>PM10</g)).toHaveLength(3);
    expect(markup.match(/>AQI</g)).toHaveLength(2);
    expect(markup.match(/>FILTER</g)).toHaveLength(2);
    expect(markup).toContain('Trend History');
    expect(markup).not.toContain('PROMETHEUS HISTORY');
    expect(markup).toContain('Loading history');
    expect(markup).toContain('Data Source: AirGradient');
    expect(markup).toContain('>Device Settings</h2>');
    expect(markup).toContain('>Additional Sensor Data</h2>');
    for (const window of ['1h', '3h', '6h', '24h', '7d', '30d', 'Custom']) expect(markup).toContain(`>${window}<`);
    expect(markup).toContain('>Mode<');
    expect(markup).toContain('aria-label="Power"');
    expect(markup).not.toContain('control-option-label">Power</span>');
    expect(markup).toContain('>Fan Speed<');
    expect(markup).toContain('aria-label="Mode"');
    expect(markup).toContain('Power: On. Show options');
    expect(markup).toContain('Preset: AUTO. Show options');
    expect(markup).toContain('Timer: Off. Show options');
    expect(markup).toContain('Light: ON. Show options');
    expect(markup).toContain('Sensitivity: NORMAL. Show options');
    expect(markup).toContain('Mode: HEAT_COOL. Show options');
    expect(markup).toContain('Fan Timer: Off. Show options');
    expect(markup).toContain('thermostat-option-row');
    expect(markup).not.toContain('>AVAILABLE<');
    expect(markup).not.toContain('>CURRENT<');
    expect(markup).not.toContain('AVAILABLE CONTROLS');
    expect(markup).not.toContain('SENSOR / LOCAL');
    expect(markup).not.toContain('THERMOSTAT / CLOUD');
    expect(markup).not.toContain('AIRMEGA 250S / CLOUD');
    expect(markup).not.toContain('COMPARISON / FALLBACK');
    expect(markup).toContain('DISPLAY 80% · LED 60%');
    expect(markup).toContain('68–74°F · HEAT_COOL');
    expect(markup).toContain('ON · AUTO · SPEED 2');
    expect(markup.match(/metric-indicator-green/g)).toHaveLength(4);
    expect(markup.match(/metric-indicator-yellow/g)).toHaveLength(2);
    expect(markup.match(/metric-indicator-blue/g)).toHaveLength(1);
    for (const label of ['TEMPERATURE', 'HUMIDITY', 'CO₂', 'PM2.5', 'PM10', 'TVOC INDEX', 'NOx INDEX']) {
      expect(markup).toContain(`aria-label="${label} trend status:`);
    }
    expect(markup).not.toContain('class="panel-footer"');
    expect(markup).toContain('Temperature unit: °F. Show options');
    expect(markup).toContain('PM standard: US AQI. Show options');
    expect(markup).toContain('LED Display: CO₂. Show options');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('airgradient-brightness-row');
    expect(markup).toContain('airgradient-display-row');
    expect(markup).toContain('indoor-slider-thumb airgradient-slider-thumb');
    expect(markup).toContain('indoor-slider-thumb nest-setpoint-thumb nest-setpoint-thumb-heat');
    expect(markup).toContain('indoor-slider-thumb nest-setpoint-thumb nest-setpoint-thumb-cool');
    expect(markup).toContain('>68°</span>');
    expect(markup).toContain('>74°</span>');
    expect(markup.indexOf('nest-setpoint-range')).toBeLessThan(markup.indexOf('thermostat-option-row'));
    expect(markup).toContain('class="control-current-positive"');
    expect(markup).not.toContain('aria-label="Button lock"');
    expect(markup).not.toContain('Review');
    expect(markup).not.toContain('<select');
    for (const graph of ['CO₂', 'Particulate matter', 'Temperature', 'Humidity', 'TVOC index', 'NOx index']) {
      expect(markup).toContain(`NO DATA · ${graph}`);
    }
    const graphOrder = ['CO₂', 'Particulate matter', 'TVOC index', 'NOx index', 'Temperature', 'Humidity'];
    for (let index = 1; index < graphOrder.length; index += 1) {
      expect(markup.indexOf(`NO DATA · ${graphOrder[index - 1]}`)).toBeLessThan(markup.indexOf(`NO DATA · ${graphOrder[index]}`));
    }
    for (const setting of ['Display brightness', 'LED brightness', 'Temperature unit', 'PM standard', 'LED Display']) expect(markup).toContain(setting);
    expect(markup.indexOf('AirGradient ONE')).toBeLessThan(markup.indexOf('Nest Thermostat'));
    expect(markup.indexOf('Nest Thermostat')).toBeLessThan(markup.indexOf('Living Room Air Purifier'));
    expect(markup).toContain('indoor-primary-readings');
    expect(markup.indexOf('Trend History')).toBeLessThan(markup.indexOf('AirGradient ONE'));
    expect(markup.indexOf('Device Settings')).toBeLessThan(markup.indexOf('AirGradient ONE'));
    expect(markup.indexOf('AirGradient ONE')).toBeLessThan(markup.indexOf('Living Room Air Purifier'));
    expect(markup.indexOf('Living Room Air Purifier')).toBeLessThan(markup.indexOf('Living Room Aranet'));
    expect(markup.indexOf('Additional Sensor Data')).toBeLessThan(markup.indexOf('Living Room Aranet'));
    expect(markup).toContain('panel aranet-panel');
  });

  it('uses green active styling only for on power, light, timers, HVAC, and Ventilate states', () => {
    const active = structuredClone(healthyBootstrapFixture);
    active.indoor.purifiers[0].timerEndsAt = '2026-07-19T13:00:00.000Z';
    active.indoor.actions.push({
      actionId: 'fixture-ventilate-active',
      target: 'indoor_environment',
      status: 'PENDING',
      acceptedAt: '2026-07-19T12:00:00.000Z',
      resolvedAt: null,
      endsAt: '2026-07-19T12:30:00.000Z',
    });
    const activeMarkup = renderToStaticMarkup(<IndoorScreen bootstrap={active} />);
    expect(activeMarkup).toContain('ventilate-button ventilate-button-active');
    expect(activeMarkup).toContain('>Ventilating…<');
    expect(activeMarkup).toContain('>Cancel ventilation<');
    expect(activeMarkup).toContain('remaining</span>');
    expect(activeMarkup).toMatch(/class="control-current-positive"[^>]*aria-label="Power: On/);
    expect(activeMarkup).toMatch(/class="control-current-positive"[^>]*aria-label="Light: ON/);
    expect(activeMarkup).toMatch(/class="control-current-positive"[^>]*aria-label="Timer: Running/);

    const inactive = structuredClone(healthyBootstrapFixture);
    inactive.indoor.thermostats[0].hvacMode = 'OFF';
    inactive.indoor.purifiers[0].power = false;
    inactive.indoor.purifiers[0].light = 'OFF';
    inactive.indoor.purifiers[1].power = false;
    inactive.indoor.purifiers[1].light = 'OFF';
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={inactive} />);
    expect(markup).not.toContain('class="control-current-positive"');
    expect(markup).not.toContain('ventilate-button-active');
  });

  it('groups retained control actions into a timestamped history panel', () => {
    const bootstrap = structuredClone(healthyBootstrapFixture);
    bootstrap.indoor.actions.push({
      actionId: 'fixture-control-history',
      target: 'coway_living_room',
      status: 'SUCCEEDED',
      acceptedAt: '2026-07-30T18:00:00.000Z',
      resolvedAt: '2026-07-30T18:00:05.000Z',
      message: 'Command completed.',
    });
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={bootstrap} />);
    expect(markup).toContain('>History</h2>');
    expect(markup).toContain('INDOOR CONTROLS');
    expect(markup).toContain('coway living room');
    expect(markup).toContain('Accepted Jul 30, 2026, 11:00 AM PDT');
    expect(markup).toContain('Resolved Jul 30, 2026, 11:00 AM PDT');
    expect(markup).toContain('dateTime="2026-07-30T18:00:00.000Z"');
    expect(markup).toContain('dateTime="2026-07-30T18:00:05.000Z"');
  });

  it('aligns live history refreshes to the next 30-second scrape boundary', () => {
    expect(nextHistoryRefreshDelay(0)).toBe(30_500);
    expect(nextHistoryRefreshDelay(29_000)).toBe(1_500);
    expect(nextHistoryRefreshDelay(30_000)).toBe(30_500);
  });

  it('renders only controls advertised by capabilities', () => {
    const bootstrap = { ...healthyBootstrapFixture, indoor: unsupportedIndoorFixture };
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={bootstrap} />);
    expect(markup).not.toContain('aria-label="Mode"');
    expect(markup).not.toContain('aria-label="Power"');
    expect(markup).not.toContain('Sensitivity');
    expect(markup).not.toContain('Display brightness');
    expect(markup).not.toContain('LED Display');
    expect(markup).toContain('Ventilate');
    expect(markup).toContain('ventilate-button" type="button" disabled');
    expect(markup).toContain('state state-crit');
  });

  it('keeps the Aranet comparison visible when the AirGradient source is partial', () => {
    const bootstrap = structuredClone(healthyBootstrapFixture);
    bootstrap.indoor.sensors[1].sourceState = 'UNAVAILABLE';
    for (const reading of Object.values(bootstrap.indoor.sensors[1].readings)) {
      reading.value = null;
      reading.metadata.freshness = 'UNAVAILABLE';
      reading.metadata.sourceState = 'UNAVAILABLE';
    }
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={bootstrap} />);
    expect(markup).toContain('aria-label="Indoor summary"');
    expect(markup).toContain('Living Room Aranet');
    expect(markup).not.toContain('COMPARISON / FALLBACK');
    expect(markup).toContain('69.8');
  });

  it('adds the compact Living Room summary to overview', () => {
    const markup = renderToStaticMarkup(<IndoorOverviewCard indoor={healthyBootstrapFixture.indoor} />);
    expect(markup).toContain('>Indoor<');
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
      thresholds={[{ value: 65, tone: 'dark-blue' }, { value: 68, tone: 'light-blue' }, { value: 72, tone: 'yellow' }, { value: 75, tone: 'red' }]}
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

  it('colors the AirGradient temperature trace across blue, green, yellow, and red zones', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="Temperature"
      thresholds={[{ value: 65, tone: 'dark-blue' }, { value: 68, tone: 'light-blue' }, { value: 72, tone: 'yellow' }, { value: 75, tone: 'red' }]}
      scale={{ fixedMin: 60, fixedMax: 80, ticks: [60, 65, 70, 75, 80] }}
      series={{
        metric: 'airgradient_living_room.temperature',
        unit: '°F',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 64 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 66 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 70 },
          { timestamp: '2026-07-25T00:15:00.000Z', value: 73 },
          { timestamp: '2026-07-25T00:20:00.000Z', value: 76 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:20:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('style="stroke:url(#history-trace-');
    expect(markup).toContain('history-trace-stop-dark-blue');
    expect(markup).toContain('history-trace-stop-light-blue');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
  });

  it('smooths the CO₂ trace and emphasizes visible threshold ticks', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="CO₂"
      thresholds={[{ value: 600, tone: 'blue' }, { value: 900, tone: 'yellow' }, { value: 1000, tone: 'red' }]}
      scale={{ fixedMin: 400, fixedMax: 1400, ticks: [400, 600, 800, 1000, 1200, 1400] }}
      series={{
        metric: 'airgradient_living_room.co2',
        unit: 'ppm',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 500 },
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
    expect(markup).toContain('threshold-tone-blue');
    expect(markup).toContain('history-trace-stop-blue');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
    expect(markup).not.toContain('<circle');
  });

  it('combines smoothed PM2.5 and dotted PM10 traces with a legend', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="Particulate matter"
      secondaryLabel="PM10"
      thresholds={[{ value: 5, tone: 'yellow' }, { value: 15, tone: 'red' }]}
      scale={{ minSpan: 20, hardMin: 0 }}
      series={{
        metric: 'airgradient_living_room.pm25',
        unit: 'µg/m³',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 3 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 10 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 18 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
      secondarySeries={{
        metric: 'airgradient_living_room.pm10',
        unit: 'µg/m³',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 5 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 14 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 24 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('<path');
    expect(markup).toContain('history-line-smoothed');
    expect(markup).toContain('history-line-secondary');
    expect(markup).toContain('graph legend');
    expect(markup).toContain('PM2.5');
    expect(markup).toContain('PM10');
    expect(markup).toContain('PM10, 3 samples, latest 24 µg/m³');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
  });

  it('colors humidity outside the 30–50% band blue', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="Humidity"
      thresholds={[{ value: 30, tone: 'light-blue' }, { value: 50, tone: 'light-blue' }]}
      scale={{ fixedMin: 0, fixedMax: 100, ticks: [0, 20, 40, 60, 80, 100] }}
      series={{
        metric: 'airgradient_living_room.humidity', unit: '%', window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 20 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 40 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 60 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('history-trace-stop-blue');
    expect(markup).toContain('history-trace-stop-green');
  });

  it.each([
    ['TVOC', 'airgradient_living_room.tvoc_index', 150, 250],
    ['NOx', 'airgradient_living_room.nox_index', 20, 150],
  ])('renders informational %s event bands across the relative index trace', (label, metric, warning, danger) => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label={label}
      thresholds={[{ value: warning, tone: 'yellow' }, { value: danger, tone: 'red' }]}
      scale={{ fixedMin: 0, fixedMax: 500, ticks: [0, 100, 200, 300, 400, 500] }}
      series={{
        metric,
        unit: 'index',
        window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 1 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: warning },
          { timestamp: '2026-07-25T00:10:00.000Z', value: danger },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain(`Thresholds ${warning}, ${danger} index`);
    expect(markup).toContain('style="stroke:url(#history-trace-');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
  });

  it('colors TVOC below 100 blue and retains green, yellow, and red upper bands', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="TVOC"
      thresholds={[{ value: 100, tone: 'blue' }, { value: 150, tone: 'yellow' }, { value: 250, tone: 'red' }]}
      scale={{ fixedMin: 0, fixedMax: 500, ticks: [0, 100, 200, 300, 400, 500] }}
      series={{
        metric: 'airgradient_living_room.tvoc_index', unit: 'index', window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 80 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 120 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 180 },
          { timestamp: '2026-07-25T00:15:00.000Z', value: 280 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:15:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup).toContain('threshold-tone-blue');
    expect(markup).toContain('history-trace-stop-blue');
    expect(markup).toContain('history-trace-stop-green');
    expect(markup).toContain('history-trace-stop-yellow');
    expect(markup).toContain('history-trace-stop-red');
  });

  it('renders the humidity lower and upper dotted thresholds', () => {
    const markup = renderToStaticMarkup(<HistoryGraph
      label="Humidity"
      thresholds={[{ value: 30, tone: 'light-blue' }, { value: 50, tone: 'light-blue' }]}
      scale={{ fixedMin: 0, fixedMax: 100, ticks: [0, 20, 40, 60, 80, 100] }}
      series={{
        metric: 'airgradient_living_room.humidity', unit: '%', window: '1h',
        points: [
          { timestamp: '2026-07-25T00:00:00.000Z', value: 25 },
          { timestamp: '2026-07-25T00:05:00.000Z', value: 45 },
          { timestamp: '2026-07-25T00:10:00.000Z', value: 65 },
        ],
        metadata: { source: 'fixture', observedAt: '2026-07-25T00:10:00.000Z', freshness: 'CURRENT', severity: 'OK' },
      }}
    />);
    expect(markup.match(/class="threshold-line/g)).toHaveLength(2);
    expect(markup.match(/class="threshold-line threshold-tone-light-blue/g)).toHaveLength(2);
    expect(markup).toContain('Thresholds 30, 50 %');
  });
});
