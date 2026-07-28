import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NetworkScreen } from './network.js';

describe('Network fixture view', () => {
  it('renders read-only protocol-labeled latency, PDU total draw, and planned endpoint states', () => {
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
    expect(markup).toContain('NOT PROVISIONED');
    expect(markup).not.toContain('Run speed test');
  });
});
