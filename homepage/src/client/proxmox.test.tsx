import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { ProxmoxPanel } from './proxmox.js';

describe('Proxmox drill-down', () => {
  it('renders the full approved host-detail metric set', () => {
    const host = healthyBootstrapFixture.hosts.find((candidate) => candidate.id === 'pve-01')!;
    const baseSeries = healthyBootstrapFixture.timeSeries[0]!;
    const networkHistory = [
      { ...baseSeries, metric: 'pve-01 RX', unit: 'Mb/s', points: [{ timestamp: '2026-07-19T11:55:00.000Z', value: 145 }, { timestamp: '2026-07-19T12:00:00.000Z', value: 120 }] },
      { ...baseSeries, metric: 'pve-01 TX', unit: 'Mb/s', points: [{ timestamp: '2026-07-19T11:55:00.000Z', value: 96 }, { timestamp: '2026-07-19T12:00:00.000Z', value: 80 }] },
    ];
    const markup = renderToStaticMarkup(<ProxmoxPanel host={{ ...host, powerWatts: 82.6 }} timeSeries={[...healthyBootstrapFixture.timeSeries, ...networkHistory]} expanded onExpand={() => undefined} />);
    expect(markup).toContain('PER-CORE');
    expect(markup).toContain('CPU CLOCK');
    expect(markup).toContain('LOAD TREND');
    expect(markup).toContain('PWR');
    expect(markup).toContain('83 W');
    expect(markup).toContain('SWAP');
    expect(markup).toContain('0.3<small> GiB / 4.0 GiB</small>');
    expect(markup).toContain('TOTAL TRANSFER <b>1.3 TiB</b>');
    expect(markup).toContain('MAX RX <b>145 Mb/s</b> · MAX TX <b>96 Mb/s</b>');
    expect(markup).toContain('CONTAINERS');
    expect(markup).toContain('VIRTUAL MACHINES');
    expect(markup).toContain('fixed-pitch dot matrix with older history clipped on the left');
    expect(markup).toContain('dot-matrix');
    expect(markup).toContain('dot-matrix-fixed');
    expect(markup).toContain('dot-graph-fill-width');
    expect(markup.match(/--graph-rows:4/g)).toHaveLength(2);
    expect(markup).toContain('--traffic-rows:4');
    expect(markup.match(/dot-matrix-fixed/g)).toHaveLength(4);
    expect(markup).toContain('traffic-matrix-fixed');
    expect(markup).toContain('Download: 120Mb/s, above midline; upload: 80Mb/s, below midline');
    expect(markup).toContain('4 historical samples');
    expect(markup).toContain('core-history-low');
    expect(markup).not.toContain('core-total');
    expect(markup).not.toContain('PDU outlet draw');
    expect(markup).not.toContain('host runtime');
    expect(markup).not.toContain('Live Glances bridge');
    expect(markup).not.toContain('Live read-only telemetry');
    expect(markup).not.toContain('1m shown above');
    expect(markup).not.toContain('Running VMs are shown above');
  });

  it('labels an unavailable summary metric without inventing a value', () => {
    const host = healthyBootstrapFixture.hosts.find((candidate) => candidate.id === 'pve-02')!;
    const markup = renderToStaticMarkup(<ProxmoxPanel host={{ ...host, powerWatts: null, cpuCorePercentages: [90, ...host.cpuCorePercentages!.slice(1)] }} expanded onExpand={() => undefined} />);
    expect(markup).toContain('PWR <b>N/S</b>');
    expect(markup).not.toContain('PDU outlet draw');
    expect(markup).toContain('core-history-medium');
    expect(markup).toContain('core-history-high');
    expect(markup).toContain('STALE');
  });

  it('keeps sub-megabit network peaks visible', () => {
    const host = healthyBootstrapFixture.hosts.find((candidate) => candidate.id === 'pve-01')!;
    const baseSeries = healthyBootstrapFixture.timeSeries[0]!;
    const networkHistory = [
      { ...baseSeries, metric: 'pve-01 RX', unit: 'Mb/s', points: [{ timestamp: '2026-07-19T12:00:00.000Z', value: 0.12 }] },
      { ...baseSeries, metric: 'pve-01 TX', unit: 'Mb/s', points: [{ timestamp: '2026-07-19T12:00:00.000Z', value: 0.04 }] },
    ];
    const markup = renderToStaticMarkup(<ProxmoxPanel host={host} timeSeries={networkHistory} expanded={false} onExpand={() => undefined} />);
    expect(markup).toContain('MAX RX <b>0.12 Mb/s</b> · MAX TX <b>0.04 Mb/s</b>');
  });
});
