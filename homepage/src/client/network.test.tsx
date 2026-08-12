import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { NetworkScreen } from './network.js';

describe('Network fixture view', () => {
  it('renders read-only protocol-labeled latency, PDU total draw, and live OKD endpoint states', () => {
    const markup = renderToStaticMarkup(<NetworkScreen />);
    expect(markup).toContain('GATEWAY / ICMP');
    expect(markup).toContain('INTERNET / HTTPS');
    expect(markup).toContain('PDU Pro');
    expect(markup).toContain('TOTAL DRAW');
    expect(markup).toContain('143');
    expect(markup).toContain('View PVE outlet draw');
    expect(markup.match(/dot-matrix-fixed/g)).toHaveLength(3);
    expect(markup).toContain('traffic-matrix-fixed');
    expect(markup).not.toContain('braille-cell');
    expect(markup).toContain('OKD endpoints');
    expect(markup).toContain('LIVE / STRICT TLS');
    expect(markup).toContain('OKD Console');
    expect(markup).not.toContain('NOT PROVISIONED');
    expect(markup).not.toContain('Run speed test');
  });

  it('renders download bars above and upload bars below the midline', () => {
    const bootstrap = structuredClone(healthyBootstrapFixture);
    const baseSeries = bootstrap.timeSeries[0]!;
    const points = [20, 65, 35, 90].map((value, index) => ({
      timestamp: `2026-07-19T11:${45 + (index * 5)}:00.000Z`,
      value,
    }));
    bootstrap.timeSeries = [
      ...bootstrap.timeSeries,
      { ...baseSeries, metric: 'pve-01 RX', unit: 'Mb/s', points },
      { ...baseSeries, metric: 'pve-01 TX', unit: 'Mb/s', points: points.map((point) => ({ ...point, value: point.value / 2 })) },
    ];
    const markup = renderToStaticMarkup(<NetworkScreen bootstrap={bootstrap} />);
    const downloadY = [...markup.matchAll(/class="traffic-matrix-download-[^"]+" cx="[^"]+" cy="([^"]+)"/g)].map((match) => Number(match[1]));
    const uploadY = [...markup.matchAll(/class="traffic-matrix-upload-[^"]+" cx="[^"]+" cy="([^"]+)"/g)].map((match) => Number(match[1]));

    expect(markup.match(/traffic-matrix-column-download/g)).toHaveLength(138);
    expect(markup.match(/traffic-matrix-column-upload/g)).toHaveLength(138);
    expect(downloadY.length).toBeGreaterThan(0);
    expect(uploadY.length).toBeGreaterThan(0);
    expect(Math.max(...downloadY)).toBeLessThan(29);
    expect(Math.min(...uploadY)).toBeGreaterThan(29);
    expect(markup).toContain('download grows above the midline and upload grows below it');
    expect(markup).not.toContain('traffic-matrix-baseline-dot');
  });
});
