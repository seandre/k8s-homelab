import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { unsupportedIndoorFixture } from '../shared/indoor-fixtures.js';
import { IndoorOverviewCard, IndoorScreen } from './indoor.js';

describe('indoor dashboard', () => {
  it('renders normalized readings, both purifiers, history windows, and capability controls', () => {
    const markup = renderToStaticMarkup(<IndoorScreen bootstrap={healthyBootstrapFixture} />);
    expect(markup).toContain('Living Room environment');
    expect(markup).toContain('Living Room Coway');
    expect(markup).toContain('Bedroom Coway');
    expect(markup).toContain('Environmental trends');
    for (const window of ['1h', '24h', '7d', '30d']) expect(markup).toContain(`>${window}<`);
    expect(markup).toContain('HVAC mode');
    expect(markup).toContain('Review power off');
    expect(markup).toContain('NO DATA · CO₂');
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
});
