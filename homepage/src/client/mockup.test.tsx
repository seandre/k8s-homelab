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

    const markup = renderToStaticMarkup(<OverviewScreen search="" bootstrap={bootstrap} />);

    expect(markup).toContain('UDM Pro');
    expect(markup).toContain('NETWORK / UNPOLLER');
    expect(markup).toContain('WAN LATENCY');
    expect(markup).toContain('WAN DOWN');
    expect(markup).toContain('WAN UP');
    expect(markup).toContain('42.8');
    expect(markup).toContain('7.3');
    expect(markup).toContain('TOTAL TRANSFER');
    expect(markup).toContain('CLIENTS');
    expect(markup).not.toContain('PVE-01 / GLANCES');
  });
});
