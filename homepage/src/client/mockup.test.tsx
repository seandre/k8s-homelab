import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { OverviewScreen } from './mockup.js';

describe('overview network tile', () => {
  it('represents the UDM Pro with UniFi WAN telemetry instead of pve-01 traffic', () => {
    const bootstrap = {
      ...healthyBootstrapFixture,
      network: {
        ...healthyBootstrapFixture.network,
        unifi: {
          controller: 'UniFi Site Manager',
          status: 'UP' as const,
          metadata: { ...healthyBootstrapFixture.network.metadata, source: 'unifi-site-manager' },
        },
      },
    };

    const markup = renderToStaticMarkup(<OverviewScreen bootstrap={bootstrap} />);

    expect(markup).toContain('UDM Pro');
    expect(markup).toContain('NETWORK / UNPOLLER');
    expect(markup).toContain('WAN LATENCY');
    expect(markup).toContain('DOWNLOAD');
    expect(markup).toContain('UPLOAD');
    expect(markup).toContain('42.8');
    expect(markup).toContain('7.3');
    expect(markup).toContain('CLIENTS');
    expect(markup).not.toContain('UniFi Site Manager');
    expect(markup).not.toContain('PVE-01 / GLANCES');
    expect(markup).not.toContain('Component states');
    expect(markup).not.toContain('HP-007');
  });
});

describe('overview dashboard content', () => {
  it('shows operational essentials without duplicating dedicated Services or OKD views', () => {
    const markup = renderToStaticMarkup(<OverviewScreen bootstrap={healthyBootstrapFixture} />);

    expect(markup).toContain('pve-01');
    expect(markup).toContain('pve-02');
    expect(markup).toContain('Indoor');
    expect(markup).toContain('UDM Pro');
    expect(markup).toContain('Kubernetes');
    expect(markup).toContain('Weather');
    expect(markup).not.toContain('>Services<');
    expect(markup).not.toContain('>OKD<');
    expect(markup).not.toContain('NOT PROVISIONED');
    expect(markup).not.toContain('WARN · 1 alert');
    expect(markup).toContain('Last refresh');
  });

  it('renders the actionable alert strip only when alerts exist', () => {
    const withAlerts = renderToStaticMarkup(<OverviewScreen bootstrap={healthyBootstrapFixture} />);
    const withoutAlerts = renderToStaticMarkup(<OverviewScreen bootstrap={{ ...healthyBootstrapFixture, alerts: [] }} />);

    expect(withAlerts).toContain('aria-label="Active alerts"');
    expect(withAlerts).toContain('View Kubernetes');
    expect(withoutAlerts).not.toContain('aria-label="Active alerts"');
  });
});
