import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { KubernetesScreen, OkdScreen } from './kubernetes.js';

describe('Kubernetes fixture views', () => {
  it('renders fixture-backed capacity, node health, and only approved workload links', () => {
    const html = renderToStaticMarkup(<KubernetesScreen />);
    expect(html).toContain('5.4');
    expect(html).toContain('k3s-worker-02');
    expect(html).toContain('koreader-sync');
    expect(html).toContain('https://argocd.lab.seandre.dev');
    expect(html.match(/class="dot-graph /g)).toHaveLength(8);
    expect(html).toContain('CPU: 36%; 1 samples; fixed-pitch dot matrix with older history clipped on the left');
    expect(html).toContain('MEMORY: 86%; 1 samples');
    expect(html.match(/dot-matrix-fixed/g)).toHaveLength(8);
    expect(html).not.toContain('braille-cell');
    expect(html).toContain('READY');
  });

  it('adds disk and network graphs only when matching history exists', () => {
    const bootstrap = structuredClone(healthyBootstrapFixture);
    const baseSeries = bootstrap.timeSeries[0]!;
    bootstrap.timeSeries = [
      ...bootstrap.timeSeries,
      { ...baseSeries, metric: 'k3s-worker-01 DISK', unit: '%', points: [{ ...baseSeries.points[0]!, value: 44 }] },
      { ...baseSeries, metric: 'k3s-worker-01 RX', unit: 'Mb/s', points: [{ ...baseSeries.points[0]!, value: 12 }] },
      { ...baseSeries, metric: 'k3s-worker-01 TX', unit: 'Mb/s', points: [{ ...baseSeries.points[0]!, value: 5 }] },
    ];
    const html = renderToStaticMarkup(<KubernetesScreen bootstrap={bootstrap} />);
    expect(html).toContain('DISK: 44%');
    expect(html).toContain('DOWNLOAD 12Mb/s');
    expect(html).toContain('UPLOAD 5Mb/s');
    expect(html.match(/dot-matrix-fixed/g)).toHaveLength(10);
    expect(html).toContain('Download: 12Mb/s, above midline; upload: 5Mb/s, below midline');
  });

  it('renders the future OKD state as neutral, not as an error', () => {
    const html = renderToStaticMarkup(<OkdScreen />);
    expect(html).toContain('NOT PROVISIONED');
    expect(html).toContain('RESERVED TOPOLOGY');
    expect(html).not.toContain('ERROR');
  });
});
