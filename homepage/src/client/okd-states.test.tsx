import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { ComputeScreen } from './compute.js';
import { buildGlobalAlertItems } from './global-alerts.js';
import { OkdScreen } from './kubernetes.js';
import { OverviewScreen } from './mockup.js';
import { NetworkScreen } from './network.js';
import { ServicesScreen } from './services.js';
import { OkdNodePanel } from './cluster-node.js';

describe('OKD cross-view states', () => {
  it('renders healthy OKD data across Overview, Compute, Network, Services, and OKD', () => {
    const compute = renderToStaticMarkup(<ComputeScreen bootstrap={healthyBootstrapFixture} />);
    const okd = renderToStaticMarkup(<OkdScreen bootstrap={healthyBootstrapFixture} />);
    const screens = [
      renderToStaticMarkup(<OverviewScreen bootstrap={healthyBootstrapFixture} />),
      compute,
      renderToStaticMarkup(<NetworkScreen bootstrap={healthyBootstrapFixture} />),
      renderToStaticMarkup(<ServicesScreen bootstrap={healthyBootstrapFixture} search="OKD" />),
      okd,
    ].join('\n');
    expect(screens).toContain('WORKLOAD / OKD');
    expect(screens).toContain('okd-cp-01');
    expect(screens).toContain('LIVE / STRICT TLS');
    expect(screens).toContain('OKD Console');
    expect(screens).toContain('All ClusterOperators are available and stable.');
    expect(screens).not.toContain('NOT PROVISIONED');
    expect(compute.match(/CPU \/ OKD/g)).toHaveLength(3);
    expect(okd.match(/CPU \/ OKD/g)).toHaveLength(3);
    expect(compute.match(/okd-node-card/g)).toHaveLength(3);
    expect(okd.match(/okd-node-card/g)).toHaveLength(3);
    expect(okd.match(/AMD Ryzen 5 PRO 5650GE · 6C\/12T/g)).toHaveLength(3);
    expect(okd).toContain('LOAD');
    expect(okd).toContain('PWR');
    expect(okd).toContain('Expand details');
    expect(okd).toContain('Open ↗');
  });

  it('uses the Proxmox host layout and exposes OKD per-core details', () => {
    const node = healthyBootstrapFixture.hosts.find((host) => host.name === 'okd-cp-01')!;
    const html = renderToStaticMarkup(<OkdNodePanel node={node} expanded onExpand={() => undefined} timeSeries={healthyBootstrapFixture.timeSeries} />);
    expect(html).toContain('CPU / OKD');
    expect(html).toContain('22 W');
    expect(html).toContain('45.4°C');
    expect(html).toContain('I/O WAIT');
    expect(html).toContain('2.6%');
    expect(html).toContain('TOTAL TRANSFER');
    expect(html).toContain('LOAD TREND');
    expect(html).toContain('metric-value">0.0<small> GiB / 0.0 GiB');
    expect(html).toContain('stopped: 42');
    expect(html).toContain('PER-CORE');
    expect(html).toContain('C0');
  });

  it('renders OKD network history with the same mirrored graph setup as Proxmox', () => {
    const node = healthyBootstrapFixture.hosts.find((host) => host.name === 'okd-cp-01')!;
    const baseSeries = healthyBootstrapFixture.timeSeries[0]!;
    const networkHistory = [
      { ...baseSeries, metric: 'okd-cp-01 RX', unit: 'Mb/s', points: [{ timestamp: '2026-07-19T11:55:00.000Z', value: 1.2 }, { timestamp: '2026-07-19T12:00:00.000Z', value: 2.4 }] },
      { ...baseSeries, metric: 'okd-cp-01 TX', unit: 'Mb/s', points: [{ timestamp: '2026-07-19T11:55:00.000Z', value: 0.8 }, { timestamp: '2026-07-19T12:00:00.000Z', value: 1.6 }] },
    ];
    const html = renderToStaticMarkup(<OkdNodePanel node={node} expanded={false} onExpand={() => undefined} timeSeries={networkHistory} />);
    expect(html).toContain('traffic-matrix-fixed');
    expect(html).toContain('--traffic-rows:4');
    expect(html).toContain('Download: 2.4Mb/s, above midline; upload: 1.6Mb/s, below midline');
    expect(html).toContain('MAX RX <b>2.4 Mb/s</b> · MAX TX <b>1.6 Mb/s</b>');
    expect(html.match(/traffic-matrix-column-download/g)).toHaveLength(138);
    expect(html.match(/traffic-matrix-column-upload/g)).toHaveLength(138);
  });

  it.each([
    ['progressing', { available: true, progressing: true, degraded: false, severity: 'INFO' as const, detail: 'Operator is progressing.' }],
    ['unavailable', { available: false, progressing: false, degraded: false, severity: 'WARN' as const, detail: 'Operator is not available.' }],
    ['degraded', { available: true, progressing: false, degraded: true, severity: 'CRIT' as const, detail: 'Operator reports a degraded condition.' }],
  ])('renders and routes a %s ClusterOperator state', (_name, state) => {
    const bootstrap = structuredClone(healthyBootstrapFixture);
    bootstrap.platformOperators[0] = {
      ...bootstrap.platformOperators[0]!, available: state.available, progressing: state.progressing, degraded: state.degraded,
      metadata: { ...bootstrap.platformOperators[0]!.metadata, severity: state.severity, message: state.detail },
    };
    const html = renderToStaticMarkup(<OkdScreen bootstrap={bootstrap} />);
    expect(html).toContain(state.detail.replace('Operator ', '').replace('.', '').toUpperCase().includes('DEGRADED') ? 'DEGRADED' : bootstrap.platformOperators[0]!.name);
    expect(buildGlobalAlertItems(bootstrap)).toContainEqual(expect.objectContaining({ name: bootstrap.platformOperators[0]!.name, severity: state.severity, href: '/okd#okd-operators' }));
  });

  it('renders NotReady, stale, and configured no-data states with specific alert destinations', () => {
    const notReady = structuredClone(healthyBootstrapFixture);
    notReady.hosts.find((host) => host.kind === 'OKD_NODE')!.metadata = { ...notReady.hosts.find((host) => host.kind === 'OKD_NODE')!.metadata, severity: 'CRIT', message: 'Node is not Ready.' };
    expect(renderToStaticMarkup(<ComputeScreen bootstrap={notReady} />)).toContain('CRIT');
    expect(buildGlobalAlertItems(notReady)).toContainEqual(expect.objectContaining({ severity: 'CRIT', href: '/okd#okd-node-health' }));

    const stale = structuredClone(healthyBootstrapFixture);
    stale.clusters.find((cluster) => cluster.id === 'okd')!.metadata = { ...stale.clusters.find((cluster) => cluster.id === 'okd')!.metadata, freshness: 'STALE', severity: 'WARN', message: 'Last known safe value retained after source failure.' };
    for (const host of stale.hosts.filter((item) => item.kind === 'OKD_NODE')) host.metadata = { ...host.metadata, freshness: 'STALE', severity: 'WARN', message: 'Last known safe value retained after source failure.' };
    expect(renderToStaticMarkup(<OkdScreen bootstrap={stale} />)).toContain('STALE');

    const noData = structuredClone(healthyBootstrapFixture);
    noData.hosts = noData.hosts.filter((host) => host.kind !== 'OKD_NODE');
    noData.platformOperators = [];
    noData.clusters.find((cluster) => cluster.id === 'okd')!.metadata = { ...noData.clusters.find((cluster) => cluster.id === 'okd')!.metadata, freshness: 'NO_DATA', severity: 'WARN', message: 'No successful OKD API sample is available.' };
    expect(renderToStaticMarkup(<OverviewScreen bootstrap={noData} />)).toContain('NO DATA');
    expect(buildGlobalAlertItems(noData)).toContainEqual(expect.objectContaining({ name: 'OKD', severity: 'WARN', href: '/okd#okd' }));
  });
});
