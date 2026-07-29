import React, { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Freshness, Severity, TimeSeries } from '../shared/contracts.js';

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

const dotPitch = 3;
const dotRadius = 0.55;
function useMeasuredGraphSize(initialHeight: number) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 416, height: initialHeight });
  useEffect(() => {
    const container = svg.current?.parentElement;
    if (!container) return;
    const update = () => {
      const bounds = container.getBoundingClientRect();
      setSize({ width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  return { svg, size };
}

function visibleGraphValues(values: number[], width: number) {
  const visibleColumns = Math.max(1, Math.floor(width / dotPitch));
  return values.slice(-visibleColumns);
}

function dotLevelClass(index: number, rows: number) {
  const ratio = rows <= 1 ? 1 : index / (rows - 1);
  if (ratio >= 0.75) return 'high';
  if (ratio >= 0.5) return 'upper';
  if (ratio >= 0.25) return 'medium';
  return ratio > 0 ? 'low-mid' : 'low';
}

function FixedDotMatrix({ values }: { values: number[] }) {
  const { svg, size } = useMeasuredGraphSize(76);
  const rows = Math.max(1, Math.floor(size.height / dotPitch));
  const visibleColumns = Math.max(1, Math.floor(size.width / dotPitch));
  // Each bootstrap carries a complete, timestamped history window.  Its length can
  // remain constant while the window advances, so retaining columns by array index
  // displays a stale frame after a page refresh.  Rebuild from that authoritative
  // window on every render; dots remain fixed-pitch and excess history clips left.
  const graphValues = visibleGraphValues(scaleValuesToWidth(values, visibleColumns), size.width);
  return (
    <svg ref={svg} className="dot-matrix dot-matrix-fixed" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
      {graphValues.map((value, column) => {
        const filledRows = Math.ceil(Math.min(100, Math.max(0, value)) / 100 * rows);
        return <g className="dot-matrix-column" key={column}>{Array.from({ length: filledRows }, (_, index) => {
          const levelClass = dotLevelClass(index, rows);
          const x = size.width - ((graphValues.length - column - 0.5) * dotPitch);
          return <circle className={`dot-matrix-level-${levelClass}`} cx={x} cy={size.height - ((index + 0.5) * dotPitch)} r={dotRadius} key={index} />;
        })}</g>;
      })}
    </svg>
  );
}

export function DotGraph({ label, values, unit, tone = 'cpu', height = 2 }: { label: string; values: number[]; unit: string; tone?: 'cpu' | 'memory' | 'disk' | 'download' | 'upload'; height?: number }) {
  const hasSamples = values.length > 0;
  const current = hasSamples ? `${values.at(-1)}${unit}` : 'N/S';
  return <div className={`dot-graph dot-graph-${tone} dot-graph-fill-width`} role="img" aria-label={`${label}: ${current}; ${values.length} samples; fixed-pitch dot matrix with older history clipped on the left`}><div className="dot-graph-trace" style={{ '--graph-rows': height } as CSSProperties} aria-hidden="true"><FixedDotMatrix values={values} /></div><small>{label} {current}</small></div>;
}

function FixedMirroredDotMatrix({ upload, download }: { upload: number[]; download: number[] }) {
  const { svg, size } = useMeasuredGraphSize(58);
  const halfHeight = size.height / 2;
  const rows = Math.max(1, Math.floor(halfHeight / dotPitch));
  const ceiling = Math.max(...upload, ...download, 1);
  const normalize = (values: number[]) => values.map((value) => Math.min(100, Math.max(0, value / ceiling * 100)));
  const visibleColumns = Math.max(1, Math.floor(size.width / dotPitch));
  const uploadValues = scaleValuesToWidth(normalize(upload), visibleColumns).slice(-visibleColumns);
  const downloadValues = scaleValuesToWidth(normalize(download), visibleColumns).slice(-visibleColumns);
  const columnCount = Math.max(uploadValues.length, downloadValues.length);
  const xForColumn = (column: number) => size.width - ((columnCount - column - 0.5) * dotPitch);
  const dots = (values: number[], direction: 'download' | 'upload') => values.map((value, column) => {
    const offset = columnCount - values.length;
    const filledRows = Math.ceil(value / 100 * rows);
    return <g className={`traffic-matrix-column traffic-matrix-column-${direction}`} key={`${direction}-${column}`}>{Array.from({ length: filledRows }, (_, index) => {
      const levelClass = dotLevelClass(index, rows);
      const y = direction === 'download'
        ? halfHeight - ((index + 0.5) * dotPitch)
        : halfHeight + ((index + 0.5) * dotPitch);
      return <circle className={`traffic-matrix-${direction}-${levelClass}`} cx={xForColumn(column + offset)} cy={y} r={dotRadius} key={index} />;
    })}</g>;
  });

  return <svg ref={svg} className="dot-matrix dot-matrix-fixed traffic-matrix-fixed" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
    {dots(downloadValues, 'download')}
    {dots(uploadValues, 'upload')}
  </svg>;
}

function formatTrafficIndicator(value: number | undefined, unit: string) {
  if (value === undefined) return 'N/S';
  return `${new Intl.NumberFormat('en-US', {
    minimumSignificantDigits: 2,
    maximumSignificantDigits: 2,
    useGrouping: false,
  }).format(value)}${unit}`;
}

export function MirroredTrafficGraph({ upload, download, unit, height = 4 }: { upload: number[]; download: number[]; unit: string; height?: number }) {
  const upCurrent = formatTrafficIndicator(upload.at(-1), unit);
  const downCurrent = formatTrafficIndicator(download.at(-1), unit);
  const summary = `Download: ${downCurrent}, above midline; upload: ${upCurrent}, below midline; ${Math.max(upload.length, download.length)} samples rendered as fixed-pitch dot bars.`;

  return <div className="traffic-graph" role="img" aria-label={summary}>
    <div className="traffic-graph-trace" style={{ '--traffic-rows': height } as CSSProperties} aria-hidden="true"><FixedMirroredDotMatrix upload={upload} download={download} /></div>
    <small><span className="traffic-download-label"><b>DOWN</b><i>{downCurrent}</i></span><span className="traffic-upload-label"><b>UP</b><i>{upCurrent}</i></span></small>
  </div>;
}
