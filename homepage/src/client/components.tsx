import React, { useId, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Freshness, Severity, TimeSeries } from '../shared/contracts.js';
import { toBrailleGraphRows, toMirroredBrailleGraphRows } from './graph.js';

export function StateBadge({ severity, label = severity }: { severity: Severity; label?: string }) {
  return <span className={`state state-${severity.toLowerCase()}`}>{label}</span>;
}

export function FreshnessLabel({ freshness, ageSeconds }: { freshness: Freshness; ageSeconds?: number }) {
  const age = ageSeconds === undefined ? '' : ` · ${ageSeconds}s old`;
  return <span className={`freshness freshness-${freshness.toLowerCase()}`}>{freshness.replace('_', ' ')}{age}</span>;
}

export function Metric({ label, value, unit = '', detail }: { label: string; value: ReactNode; unit?: string; detail?: string }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}<small>{unit}</small></strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </div>
  );
}

export function Sparkline({ series, label }: { series: TimeSeries; label: string }) {
  const values = series.points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 92 - ((value - min) / range) * 78;
    return `${x},${y}`;
  }).join(' ');
  const summary = `${label}: ${values.at(-1) ?? 'no'} ${series.unit}; ${series.window} window; ${values.length} samples.`;
  return (
    <div className="sparkline-wrap">
      <svg className="sparkline" viewBox="0 0 100 100" role="img" aria-label={summary} preserveAspectRatio="none">
        <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="sr-only">{summary}</span>
    </div>
  );
}

export function Panel({
  title,
  eyebrow,
  severity = 'OK',
  freshness = 'CURRENT',
  children,
  href,
  expanded = false,
  onExpand,
  className = '',
  id,
}: {
  title: string;
  eyebrow?: string;
  severity?: Severity;
  freshness?: Freshness;
  children: ReactNode;
  href?: string;
  expanded?: boolean;
  onExpand?: () => void;
  className?: string;
  id?: string;
}) {
  const titleId = useId();
  const interactive = onExpand !== undefined;
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (interactive && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onExpand();
    }
  };
  return (
    <section
      id={id}
      className={`panel ${className} ${expanded ? 'panel-expanded' : ''}`}
      aria-labelledby={titleId}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onClick={interactive ? onExpand : undefined}
    >
      <header className="panel-header">
        <div>
          {eyebrow ? <span className="panel-eyebrow">{eyebrow}</span> : null}
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className="panel-state"><StateBadge severity={severity} /><FreshnessLabel freshness={freshness} /></div>
      </header>
      <div className="panel-body">{children}</div>
      <footer className="panel-footer">
        {href ? <a className="open-link" href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open ↗</a> : <span />}
        {interactive ? <button className="expand-button" type="button" onClick={(event) => { event.stopPropagation(); onExpand(); }}>{expanded ? 'Close details' : 'Expand details'}</button> : null}
      </footer>
    </section>
  );
}

export function DetailDrawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <aside className="drawer" aria-label={`${title} details`}>
      <div className="drawer-header"><h2>{title}</h2><button type="button" onClick={onClose}>Close</button></div>
      {children}
    </aside>
  );
}

export function BrailleCells({ row }: { row: string }) {
  return <>{Array.from(row).map((cell, index) => <span className="braille-cell" key={index}>{cell}</span>)}</>;
}

function scaleValuesToWidth(values: number[], sampleCount: number) {
  if (values.length === 0 || values.length >= sampleCount) return values;
  if (values.length === 1) return Array(sampleCount).fill(values[0]!);
  return Array.from({ length: sampleCount }, (_, index) => {
    const position = index * (values.length - 1) / (sampleCount - 1);
    const left = Math.floor(position);
    const right = Math.min(values.length - 1, Math.ceil(position));
    const progress = position - left;
    return values[left]! + ((values[right]! - values[left]!) * progress);
  });
}

export function DotGraph({ label, values, unit, tone = 'cpu', height = 2, width = 64, fillWidth = false }: { label: string; values: number[]; unit: string; tone?: 'cpu' | 'memory' | 'disk' | 'download' | 'upload'; height?: number; width?: number; fillWidth?: boolean }) {
  const hasSamples = values.length > 0;
  const graphValues = fillWidth ? scaleValuesToWidth(values, width * 2) : values;
  const rows = hasSamples ? toBrailleGraphRows(graphValues, width, height) : Array.from({ length: height }, () => '\u2800'.repeat(width));
  const current = hasSamples ? `${values.at(-1)}${unit}` : 'N/S';
  return <div className={`dot-graph dot-graph-${tone}${fillWidth ? ' dot-graph-fill-width' : ''}`} role="img" aria-label={`${label}: ${current}; ${values.length} samples; ${height * 4} vertical Braille dot levels`}><div className="dot-graph-trace" style={{ '--graph-columns': width, '--graph-rows': height } as CSSProperties} aria-hidden="true">{rows.map((row, index) => <span className="dot-graph-row" key={index}><BrailleCells row={row} /></span>)}</div><small>{label} {current}</small></div>;
}

export function MirroredTrafficGraph({ upload, download, unit, height = 3, width = 64 }: { upload: number[]; download: number[]; unit: string; height?: number; width?: number }) {
  const hasSamples = upload.length > 0 || download.length > 0;
  const activeCells = Math.min(width, Math.max(1, Math.ceil(Math.max(upload.length, download.length) / 2)));
  const graph = toMirroredBrailleGraphRows(upload, download, activeCells, height);
  const pad = (row: string) => `${'\u00a0'.repeat(width - activeCells)}${row}`;
  const empty = '\u00a0'.repeat(width);
  const uploadRows = hasSamples ? graph.upload.map(pad) : Array.from({ length: height }, () => empty);
  const downloadRows = hasSamples ? graph.download.map(pad) : Array.from({ length: height }, () => empty);
  const baseline = '⠤'.repeat(width);
  const upCurrent = upload.length > 0 ? `${upload.at(-1)}${unit}` : 'N/S';
  const downCurrent = download.length > 0 ? `${download.at(-1)}${unit}` : 'N/S';
  const summary = `Upload: ${upCurrent}, above baseline; download: ${downCurrent}, below baseline; ${Math.max(upload.length, download.length)} samples.`;

  return <div className="traffic-graph" role="img" aria-label={summary}>
    <div className="traffic-graph-trace" style={{ '--graph-columns': width } as CSSProperties} aria-hidden="true">
      <div className="traffic-graph-upload">{uploadRows.map((row, index) => <span className="traffic-graph-row" key={index}>{row}</span>)}</div>
      <span className="traffic-graph-baseline">{baseline}</span>
      <div className="traffic-graph-download">{downloadRows.map((row, index) => <span className="traffic-graph-row" key={index}>{row}</span>)}</div>
    </div>
    <small><span className="traffic-upload-label">UP {upCurrent}</span><span className="traffic-download-label">DOWN {downCurrent}</span></small>
  </div>;
}
