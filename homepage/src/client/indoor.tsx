import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  Bootstrap, IndoorActionAccepted, IndoorCommand, IndoorState, TimeSeries,
} from '../shared/contracts.js';
import { BootstrapSchema, HistoryResponseSchema, IndoorActionAcceptedSchema, indoorVentilationStateVersion } from '../shared/contracts.js';
import { Metric, Panel, StateBadge } from './components.js';
import { mergeIndoorActionHistory } from './data.js';
import { computeHistoryDomain, nextHistoryRefreshDelay, smoothSvgPath, ventilationTimeRemaining, type HistoryScale } from './indoor-chart.js';

const WINDOWS = ['1h', '3h', '6h', '24h', '7d', '30d'] as const;
type Window = typeof WINDOWS[number];
type HistorySelection =
  | { window: Window }
  | { window: 'custom'; mode: 'relative'; durationMs: number }
  | { window: 'custom'; mode: 'exact'; start: string; end: string };
type HistoryUpdateState = { status: 'LOADING' | 'CURRENT' | 'STALE'; updatedAt: string | null };
type Review = { command: IndoorCommand; target: string; current: string; requested: string; dependency: 'NEST_CLOUD' | 'COWAY_CLOUD' | 'AIRGRADIENT_LOCAL' | 'MULTI_CLOUD'; stateVersion: string };
type IndoorReading = IndoorState['sensors'][0]['readings']['temperature'];
type ThermostatState = IndoorState['thermostats'][0];
type PurifierState = IndoorState['purifiers'][number];
type ThresholdTone = 'blue' | 'light-blue' | 'dark-blue' | 'yellow' | 'red';
type TraceTone = 'green' | ThresholdTone | 'secondary';
type HistoryThreshold = { value: number; tone: ThresholdTone };
type HistoryMetric = { alias: string; label: string; thresholds: HistoryThreshold[]; scale: HistoryScale; secondaryAlias?: string; secondaryLabel?: string };
type DirectCommand = (command: IndoorCommand, stateVersion: string) => Promise<void>;

function display(reading: IndoorReading, digits = 0) {
  return reading.value === null ? '—' : reading.value.toFixed(digits);
}

function freshnessDetail(reading: IndoorReading) {
  return reading.metadata.freshness === 'CURRENT' ? undefined : reading.metadata.freshness;
}

function sourceSeverity(state: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE') {
  return state === 'AVAILABLE' ? 'OK' as const : state === 'DEGRADED' ? 'WARN' as const : 'CRIT' as const;
}

function panelFreshness(value: IndoorState['rooms'][number]['freshness']) {
  return value === 'UNAVAILABLE' ? 'NO_DATA' as const : value;
}

function requestReview(command: IndoorCommand, target: string, current: string, requested: string, dependency: Review['dependency'], stateVersion: string): Review {
  return { command, target, current, requested, dependency, stateVersion };
}

export function IndoorOverviewCard({ indoor }: { indoor: IndoorState }) {
  const room = indoor.rooms.find((item) => item.alias === 'living_room')!;
  const severity = room.activeAlertCount > 0 ? 'WARN' : room.freshness === 'CURRENT' ? 'OK' : 'INFO';
  return (
    <Panel className="overview-summary-card" title="Indoor" eyebrow="LIVING ROOM" severity={severity} freshness={panelFreshness(room.freshness)} statusDetail={`${room.temperatureF === null ? '—' : room.temperatureF.toFixed(1)}°F · ${room.co2Ppm ?? '—'} ppm`}>
      <div className="indoor-overview-metrics">
        <Metric label="TEMP" value={room.temperatureF === null ? '—' : room.temperatureF.toFixed(1)} unit="°F" />
        <Metric label="HUMIDITY" value={room.humidityPercent ?? '—'} unit="%" />
        <Metric label="CO₂" value={room.co2Ppm ?? '—'} unit="ppm" />
        <Metric label="WORST PM2.5" value={room.pm25WorstMicrogramsM3 ?? '—'} unit="µg/m³" />
        <Metric label="ALERTS" value={room.activeAlertCount} />
      </div>
      <a className="indoor-card-link" href="/indoor">Open indoor dashboard →</a>
    </Panel>
  );
}

function historyTimeLabel(timestamp: string, window: TimeSeries['window'], durationMs = 0) {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = window === '30d' || (window === 'custom' && durationMs >= 7 * 86_400_000)
    ? { month: 'short', day: 'numeric' }
    : window === '7d' || (window === 'custom' && durationMs >= 2 * 86_400_000)
      ? { weekday: 'short', hour: 'numeric' }
      : { hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/Los_Angeles' }).format(date);
}

function historyTooltipTime(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(timestamp));
}

function historyUpdatedTime(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(timestamp));
}

function actionTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(timestamp));
}

function actionHistorySeverity(actions: IndoorState['actions']) {
  if (actions.some((action) => action.status === 'FAILED' || action.status === 'TIMED_OUT')) return 'CRIT' as const;
  if (actions.some((action) => action.status === 'PENDING')) return 'INFO' as const;
  return 'OK' as const;
}

export function HistoryGraph({ series, secondarySeries, label, secondaryLabel, thresholds, scale }: {
  series: TimeSeries | undefined;
  secondarySeries?: TimeSeries;
  label: string;
  secondaryLabel?: string;
  thresholds: HistoryThreshold[];
  scale: HistoryScale;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const gradientId = `history-trace-${useId().replaceAll(':', '')}`;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const interactionSeries = series?.points.length ? series : secondarySeries;
  if (!interactionSeries?.points.length) return <div className="indoor-no-data" role="status">NO DATA · {label}</div>;
  const primaryValues = series?.points.map((point) => point.value) ?? [];
  const secondaryValues = secondarySeries?.points.map((point) => point.value) ?? [];
  const values = [...primaryValues, ...secondaryValues];
  const { min, max, ticks } = computeHistoryDomain(values, scale);
  const range = max - min;
  const plotLeft = 0;
  const plotRight = 100;
  const plotTop = 8;
  const plotBottom = 92;
  const y = (value: number) => plotBottom - ((value - min) / range) * (plotBottom - plotTop);
  const timestamps = [...(series?.points ?? []), ...(secondarySeries?.points ?? [])].map((point) => Date.parse(point.timestamp));
  const firstTimestamp = Math.min(...timestamps);
  const lastTimestamp = Math.max(...timestamps);
  const timeRange = Math.max(lastTimestamp - firstTimestamp, 1);
  const chart = (input: TimeSeries | undefined) => input?.points.map((point) => {
    const x = values.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + ((Date.parse(point.timestamp) - firstTimestamp) / timeRange) * (plotRight - plotLeft);
    return { x, y: y(point.value) };
  }) ?? [];
  const chartPoints = chart(series);
  const secondaryChartPoints = chart(secondarySeries);
  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const timestamp = new Date(firstTimestamp + timeRange * ratio).toISOString();
    return { x: plotLeft + ratio * (plotRight - plotLeft), timestamp };
  });
  const hoveredPoint = hoveredIndex === null ? null : interactionSeries.points[hoveredIndex]!;
  const interactionChartPoints = series?.points.length ? chartPoints : secondaryChartPoints;
  const hoveredChartPoint = hoveredIndex === null ? null : interactionChartPoints[hoveredIndex]!;
  const hoveredSecondaryIndex = hoveredPoint && secondarySeries?.points.length
    ? secondarySeries.points.reduce((best, point, index) =>
      Math.abs(Date.parse(point.timestamp) - Date.parse(hoveredPoint.timestamp))
        < Math.abs(Date.parse(secondarySeries.points[best]!.timestamp) - Date.parse(hoveredPoint.timestamp)) ? index : best, 0)
    : null;
  const hoveredSecondaryPoint = hoveredSecondaryIndex === null ? null : secondarySeries!.points[hoveredSecondaryIndex]!;
  const yellowThreshold = thresholds.find(({ tone }) => tone === 'yellow')?.value;
  const redThreshold = thresholds.find(({ tone }) => tone === 'red')?.value;
  const blueThreshold = thresholds.find(({ tone }) => tone === 'blue')?.value;
  const humidityTrace = series?.metric === 'airgradient_living_room.humidity';
  const temperatureTrace = series?.metric === 'airgradient_living_room.temperature';
  const humidityLow = humidityTrace ? thresholds[0]?.value : undefined;
  const humidityHigh = humidityTrace ? thresholds.at(-1)?.value : undefined;
  const temperatureDarkBlue = thresholds.find(({ tone }) => tone === 'dark-blue')?.value;
  const temperatureLightBlue = thresholds.find(({ tone }) => tone === 'light-blue')?.value;
  const thresholdTrace = series && (humidityTrace || temperatureTrace || (yellowThreshold !== undefined && redThreshold !== undefined
    && [
      'airgradient_living_room.co2',
      'airgradient_living_room.pm25',
      'airgradient_living_room.tvoc_index',
      'airgradient_living_room.nox_index',
    ].includes(series.metric)));
  const traceTone = (value: number): TraceTone => {
    if (humidityTrace) return value < humidityLow! || value > humidityHigh! ? 'blue' : 'green';
    if (temperatureTrace) {
      if (value < temperatureDarkBlue!) return 'dark-blue';
      if (value < temperatureLightBlue!) return 'light-blue';
    }
    if (blueThreshold !== undefined && value < blueThreshold) return 'blue';
    return value >= redThreshold! ? 'red' : value >= yellowThreshold! ? 'yellow' : 'green';
  };
  const traceBoundaries = humidityTrace
    ? [humidityLow!, humidityHigh!]
    : temperatureTrace
      ? [temperatureDarkBlue!, temperatureLightBlue!, yellowThreshold!, redThreshold!]
      : [...(blueThreshold === undefined ? [] : [blueThreshold]), yellowThreshold!, redThreshold!];
  const traceStops = thresholdTrace ? chartPoints.flatMap((point, index) => {
    if (index === chartPoints.length - 1) return [{ offset: point.x, tone: traceTone(primaryValues[index]!) }];
    const nextPoint = chartPoints[index + 1]!;
    const value = primaryValues[index]!;
    const nextValue = primaryValues[index + 1]!;
    const crossings = traceBoundaries
      .filter((threshold) => (value < threshold && nextValue >= threshold) || (value >= threshold && nextValue < threshold))
      .map((threshold) => ({
        offset: point.x + ((threshold - value) / (nextValue - value)) * (nextPoint.x - point.x),
        threshold,
      }))
      .sort((a, b) => a.offset - b.offset);
    const stops = [{ offset: point.x, tone: traceTone(value) }];
    for (const crossing of crossings) {
      const direction = nextValue > value ? 0.001 : -0.001;
      stops.push(
        { offset: crossing.offset, tone: traceTone(crossing.threshold - direction) },
        { offset: crossing.offset, tone: traceTone(crossing.threshold + direction) },
      );
    }
    return stops;
  }) : [];
  const hoveredTraceTone: TraceTone = series?.points.length
    ? thresholdTrace && hoveredPoint ? traceTone(hoveredPoint.value) : 'green'
    : 'secondary';
  const selectNearestPoint = (clientX: number) => {
    const bounds = plot.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1) * 100;
    const interactionPoints = series?.points.length ? chartPoints : secondaryChartPoints;
    const nearest = interactionPoints.reduce((best, point, index) =>
      Math.abs(point.x - x) < Math.abs(interactionPoints[best]!.x - x) ? index : best, 0);
    setHoveredIndex(nearest);
  };
  const points = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const secondaryPoints = secondaryChartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const smoothMetric = [
    'aranet_living_room.temperature',
    'aranet_living_room.humidity',
    'aranet_living_room.co2',
    'coway_living_room.pm25',
    'airgradient_living_room.co2',
    'airgradient_living_room.pm25',
    'airgradient_living_room.humidity',
    'airgradient_living_room.tvoc_index',
    'airgradient_living_room.nox_index',
    'airgradient_living_room.temperature',
    ].includes(series?.metric ?? '') && chartPoints.length > 2;
  const valueLabel = (value: number) => value.toFixed(scale.digits ?? 0);
  const summary = `${label}, ${interactionSeries.window}, ${interactionSeries.points.length} samples, latest ${interactionSeries.points.at(-1)!.value} ${interactionSeries.unit}.`
    + (secondarySeries?.points.length ? ` ${secondaryLabel}, ${secondarySeries.points.length} samples, latest ${secondarySeries.points.at(-1)!.value} ${secondarySeries.unit}.` : '')
    + ` Thresholds ${thresholds.map((threshold) => threshold.value).join(', ')} ${interactionSeries.unit}.`;
  return (
    <figure className="indoor-history-graph">
      <figcaption><strong>{label}</strong><span>{valueLabel(interactionSeries.points.at(-1)!.value)} {interactionSeries.unit}</span></figcaption>
      {secondaryLabel ? <div className="history-legend" aria-label={`${label} graph legend`}>
        <span><i className="history-legend-primary" aria-hidden="true" />PM2.5</span>
        <span><i className="history-legend-secondary" aria-hidden="true" />{secondaryLabel}</span>
      </div> : null}
      <div className="history-chart">
        <div className="y-axis-labels" aria-hidden="true">
          <span className="y-axis-unit">{interactionSeries.unit}</span>
          {ticks.map((value) => {
            const threshold = thresholds.find((item) => item.value === value);
            return <span key={value} className={`y-axis-label${threshold ? ` y-axis-label-threshold threshold-tone-${threshold.tone}` : ''}`} style={{ top: `${y(value)}%` }}>{valueLabel(value)}</span>;
          })}
        </div>
        <div
          ref={plot}
          className="history-plot"
          role="img"
          tabIndex={0}
          aria-label={summary}
          onPointerMove={(event) => selectNearestPoint(event.clientX)}
          onPointerLeave={() => setHoveredIndex(null)}
          onFocus={() => setHoveredIndex((current) => current ?? interactionSeries.points.length - 1)}
          onBlur={() => setHoveredIndex(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowLeft' ? -1 : 1;
            setHoveredIndex((current) => Math.min(Math.max((current ?? interactionSeries.points.length - 1) + direction, 0), interactionSeries.points.length - 1));
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {thresholdTrace ? <defs><linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={plotLeft} x2={plotRight}>
              {traceStops.map((stop, index) => <stop key={`${stop.offset}-${index}`} offset={`${stop.offset}%`} className={`history-trace-stop history-trace-stop-${stop.tone}`} />)}
            </linearGradient></defs> : null}
            {ticks.map((value) => <line key={value} x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} className="y-axis-grid" />)}
            {xTicks.map(({ x }) => <line key={x} x1={x} x2={x} y1={plotTop} y2={plotBottom} className="x-axis-grid" />)}
            <line x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} className="y-axis-line" />
            {thresholds.filter(({ value }) => value >= min && value <= max).map(({ value, tone }) =>
              <line key={value} x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} className={`threshold-line threshold-tone-${tone}`} />,
            )}
            {chartPoints.length && smoothMetric
              ? <path d={smoothSvgPath(chartPoints)} className="history-line history-line-smoothed" style={thresholdTrace ? { stroke: `url(#${gradientId})` } : undefined} vectorEffect="non-scaling-stroke" />
              : chartPoints.length ? <polyline points={points} className="history-line" style={thresholdTrace ? { stroke: `url(#${gradientId})` } : undefined} vectorEffect="non-scaling-stroke" /> : null}
            {secondaryChartPoints.length > 2
              ? <path d={smoothSvgPath(secondaryChartPoints)} className="history-line history-line-secondary" vectorEffect="non-scaling-stroke" />
              : secondaryChartPoints.length ? <polyline points={secondaryPoints} className="history-line history-line-secondary" vectorEffect="non-scaling-stroke" /> : null}
            {hoveredChartPoint ? <>
              <line x1={hoveredChartPoint.x} x2={hoveredChartPoint.x} y1={plotTop} y2={plotBottom} className="history-crosshair" />
            </> : null}
          </svg>
          {hoveredPoint && hoveredChartPoint ? <div
            className={`history-tooltip${hoveredChartPoint.x > 62 ? ' history-tooltip-left' : ''}`}
            style={{ left: `${hoveredChartPoint.x}%`, top: `${Math.min(Math.max(hoveredChartPoint.y, 18), 72)}%` }}
            role="status"
          >
            <strong>{historyTooltipTime(hoveredPoint.timestamp)}</strong>
            <span><i className={`history-tooltip-marker-${hoveredTraceTone}`} aria-hidden="true" />{valueLabel(hoveredPoint.value)} {interactionSeries.unit}</span>
            {hoveredSecondaryPoint ? <span><i className="history-tooltip-secondary" aria-hidden="true" />{secondaryLabel}: {valueLabel(hoveredSecondaryPoint.value)} {secondarySeries!.unit}</span> : null}
          </div> : null}
        </div>
        <div className="x-axis-labels" aria-hidden="true">
          {xTicks.map(({ x, timestamp }, index) => <span key={x} style={{ left: `${x}%` }}>{index === xTicks.length - 1 ? 'Current' : historyTimeLabel(timestamp, interactionSeries.window, timeRange)}</span>)}
        </div>
      </div>
    </figure>
  );
}

function OptionButtonGroup<T extends string | number>({ label, options, value, disabled, format = String, onSelect }: {
  label: string;
  options: T[];
  value: T | null;
  disabled: boolean;
  format?: (option: T) => string;
  onSelect: (option: T) => void;
}) {
  return <div className="control-option-group" role="group" aria-label={label}>
    <span className="control-option-label">{label}</span>
    <div className="control-button-row">{options.map((option) => <button
      type="button"
      aria-pressed={option === value}
      disabled={disabled}
      key={option}
      onClick={() => { if (option !== value) onSelect(option); }}
    >{format(option)}</button>)}</div>
  </div>;
}

function PopoverOptionButton<T extends string | number>({ label, options, value, disabled, format = String, positive = false, currentLabel, hideLabel = false, onSelect }: {
  label: string;
  options: T[];
  value: T | null;
  disabled: boolean;
  format?: (option: T) => string;
  positive?: boolean;
  currentLabel?: string | undefined;
  hideLabel?: boolean;
  onSelect: (option: T) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);
  if (!options.length) return null;
  return <div className="control-option-group control-option-popover" role="group" aria-label={label} ref={root}>
    {hideLabel ? null : <span className="control-option-label">{label}</span>}
    <button className={positive ? 'control-current-positive' : undefined} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} aria-label={`${label}: ${currentLabel ?? (value === null ? 'unknown' : format(value))}. Show options`}>
      {currentLabel ?? (value === null ? 'Unknown' : format(value))}
    </button>
    {open ? <div className="control-option-menu" role="menu" aria-label={`${label} options`}>
      {options.map((option) => <button type="button" role="menuitemradio" aria-checked={option === value} key={option} onClick={() => {
        setOpen(false);
        if (option !== value) onSelect(option);
      }}>{format(option)}</button>)}
    </div> : null}
  </div>;
}

function sliderCommitKey(key: string) {
  return ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp'].includes(key);
}

function NestSetpointRange({ thermostat, disabled, onCommit }: { thermostat: ThermostatState; disabled: boolean; onCommit: DirectCommand }) {
  const min = thermostat.capabilities.setpointMinF ?? 50;
  const max = thermostat.capabilities.setpointMaxF ?? 90;
  const step = thermostat.capabilities.setpointStepF ?? 1;
  const [heat, setHeat] = useState(thermostat.heatSetpointF ?? 68);
  const [cool, setCool] = useState(thermostat.coolSetpointF ?? 74);
  const [windowFocused, setWindowFocused] = useState(true);
  const lastCommitted = useRef<string | null>(null);
  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    const onVisibilityChange = () => setWindowFocused(document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  const commit = (nextHeat: number, nextCool: number) => {
    const key = `${nextHeat}:${nextCool}`;
    if (key === lastCommitted.current) return;
    lastCommitted.current = key;
    void onCommit({ type: 'NEST_SET_SETPOINT', target: 'nest_living_room', setpoint: { shape: 'RANGE', heatTemperatureF: nextHeat, coolTemperatureF: nextCool } }, thermostat.stateVersion).catch(() => { lastCommitted.current = null; });
  };
  const heatPosition = (heat - min) / (max - min) * 100;
  const coolPosition = (cool - min) / (max - min) * 100;
  const thumbPosition = (position: number) => `calc(${position}% + ${(0.75 - 1.5 * position / 100).toFixed(4)}rem)`;
  const updateHeat = (value: number) => setHeat(Math.min(value, cool - step));
  const updateCool = (value: number) => setCool(Math.max(value, heat + step));
  return <div className="nest-setpoint-range"><span className="control-option-label">Setpoint range</span><div className={`nest-setpoint-track${windowFocused ? '' : ' nest-setpoint-track-inactive'}`} style={{ background: `linear-gradient(to right, var(--threshold-red) 0 ${heatPosition}%, var(--divider) ${heatPosition}% ${coolPosition}%, var(--threshold-blue) ${coolPosition}% 100%)` }}><input className="nest-setpoint-heat" aria-label={`Nest heat setpoint: ${heat} degrees Fahrenheit`} type="range" min={min} max={max} step={step} value={heat} onChange={(event) => updateHeat(Number(event.target.value))} onPointerUp={(event) => commit(Math.min(Number(event.currentTarget.value), cool - step), cool)} onKeyUp={(event) => { if (sliderCommitKey(event.key)) commit(Math.min(Number(event.currentTarget.value), cool - step), cool); }} disabled={disabled} /><input className="nest-setpoint-cool" aria-label={`Nest cool setpoint: ${cool} degrees Fahrenheit`} type="range" min={min} max={max} step={step} value={cool} onChange={(event) => updateCool(Number(event.target.value))} onPointerUp={(event) => commit(heat, Math.max(Number(event.currentTarget.value), heat + step))} onKeyUp={(event) => { if (sliderCommitKey(event.key)) commit(heat, Math.max(Number(event.currentTarget.value), heat + step)); }} disabled={disabled} /><span className="nest-setpoint-thumb nest-setpoint-thumb-heat" style={{ left: thumbPosition(heatPosition) }} aria-hidden="true">{heat}°</span><span className="nest-setpoint-thumb nest-setpoint-thumb-cool" style={{ left: thumbPosition(coolPosition) }} aria-hidden="true">{cool}°</span></div></div>;
}

function ThermostatControls({ thermostat, review, onCommit }: { thermostat: ThermostatState; review: (item: Review) => void; onCommit: DirectCommand }) {
  const disabled = thermostat.sourceState !== 'AVAILABLE';
  return (
    <div className="indoor-controls thermostat-controls">
      {thermostat.capabilities.setpointShapes.includes('RANGE') ? <NestSetpointRange thermostat={thermostat} disabled={disabled} onCommit={onCommit} /> : null}
      <div className="thermostat-option-row">
        {thermostat.capabilities.hvacModes.supported ? <PopoverOptionButton label="Mode" options={thermostat.capabilities.hvacModes.options} value={thermostat.hvacMode} disabled={disabled} positive={thermostat.hvacMode !== null && thermostat.hvacMode !== 'OFF'} onSelect={(mode) =>
          review(requestReview({ type: 'NEST_SET_HVAC_MODE', target: 'nest_living_room', mode: mode as NonNullable<ThermostatState['hvacMode']> }, 'Living Room Nest', thermostat.hvacMode ?? 'Unknown', mode, 'NEST_CLOUD', thermostat.stateVersion))
        } /> : null}
        {thermostat.capabilities.fanTimerMinutes.supported ? <PopoverOptionButton label="Fan Timer" options={thermostat.capabilities.fanTimerMinutes.values} value={thermostat.fanTimerEndsAt ? null : 0} disabled={disabled} positive={Boolean(thermostat.fanTimerEndsAt)} currentLabel={thermostat.fanTimerEndsAt ? 'Running' : undefined} format={(minutes) => minutes === 0 ? 'Off' : `${minutes}m`} onSelect={(minutes) =>
          review(requestReview({ type: 'NEST_SET_FAN_TIMER', target: 'nest_living_room', durationMinutes: minutes }, 'Living Room Nest', thermostat.fanTimerEndsAt ? 'Running' : 'Off', minutes === 0 ? 'Off' : `${minutes} minutes`, 'NEST_CLOUD', thermostat.stateVersion))
        } /> : null}
      </div>
    </div>
  );
}

function PurifierControls({ purifier, review }: { purifier: PurifierState; review: (item: Review) => void }) {
  const disabled = purifier.sourceState !== 'AVAILABLE';
  const make = (command: IndoorCommand, current: string, requested: string) => review(requestReview(command, purifier.room === 'living_room' ? 'Living Room Coway' : 'Bedroom Coway', current, requested, 'COWAY_CLOUD', purifier.stateVersion));
  return (
    <div className="indoor-controls purifier-controls">
      {purifier.capabilities.power.supported ? <PopoverOptionButton label="Power" hideLabel options={['On', 'Off']} value={purifier.power ? 'On' : 'Off'} disabled={disabled} positive={purifier.power === true} onSelect={(value) =>
        make({ type: 'COWAY_SET_POWER', target: purifier.alias, power: value === 'On' }, purifier.power ? 'On' : 'Off', value)
      } /> : null}
      {purifier.capabilities.speeds.supported ? <OptionButtonGroup label="Fan Speed" options={purifier.capabilities.speeds.values} value={purifier.speed} disabled={disabled} onSelect={(value) =>
        make({ type: 'COWAY_SET_SPEED', target: purifier.alias, speed: value as 1 | 2 | 3 }, String(purifier.speed ?? 'Unknown'), String(value))
      } /> : null}
      {purifier.capabilities.presets.supported ? <PopoverOptionButton label="Preset" options={purifier.capabilities.presets.options} value={purifier.preset} disabled={disabled} onSelect={(value) =>
        make({ type: 'COWAY_SET_PRESET', target: purifier.alias, preset: value }, purifier.preset ?? 'Unknown', value)
      } /> : null}
      {purifier.capabilities.timerMinutes.supported ? <PopoverOptionButton label="Timer" options={purifier.capabilities.timerMinutes.values} value={purifier.timerEndsAt ? null : 0} disabled={disabled} positive={Boolean(purifier.timerEndsAt)} currentLabel={purifier.timerEndsAt ? 'Running' : undefined} format={(value) => value === 0 ? 'Off' : `${value}m`} onSelect={(value) =>
        make({ type: 'COWAY_SET_TIMER', target: purifier.alias, durationMinutes: value }, purifier.timerEndsAt ? 'Running' : 'Off', value === 0 ? 'Off' : `${value} minutes`)
      } /> : null}
      {purifier.capabilities.lightOptions.supported ? <PopoverOptionButton label="Light" options={purifier.capabilities.lightOptions.options} value={purifier.light} disabled={disabled} positive={purifier.light === 'ON' || purifier.light === 'AQI_OFF'} format={(value) => value.replaceAll('_', ' ')} onSelect={(value) =>
        make({ type: 'COWAY_SET_LIGHT', target: purifier.alias, light: value }, purifier.light ?? 'Unknown', value)
      } /> : null}
      {purifier.capabilities.sensitivityOptions.supported ? <PopoverOptionButton label="Sensitivity" options={purifier.capabilities.sensitivityOptions.options} value={purifier.sensitivity} disabled={disabled} onSelect={(value) =>
        make({ type: 'COWAY_SET_SENSITIVITY', target: purifier.alias, sensitivity: value }, purifier.sensitivity ?? 'Unknown', value)
      } /> : null}
    </div>
  );
}

function airGradientOptionLabel(option: string) {
  return ({ fahrenheit: '°F', celsius: '°C', ugm3: 'µg/m³', us_aqi: 'US AQI', co2: 'CO₂', pm: 'PM', off: 'Off' } as Record<string, string>)[option] ?? option.replaceAll('_', ' ');
}

function AirGradientBrightnessControl({
  label, value, capability, type, disabled, onCommit,
}: {
  label: string;
  value: number | null;
  capability: IndoorState['sensors'][1]['capabilities']['displayBrightness'];
  type: 'AIRGRADIENT_SET_DISPLAY_BRIGHTNESS' | 'AIRGRADIENT_SET_LED_BRIGHTNESS';
  disabled: boolean;
  onCommit: (command: IndoorCommand) => Promise<void>;
}) {
  const [requested, setRequested] = useState(value ?? capability.min);
  const lastCommitted = useRef<number | null>(null);
  const commit = (next: number) => {
    if (next === lastCommitted.current) return;
    lastCommitted.current = next;
    void onCommit({ type, target: 'airgradient_living_room', value: next }).catch(() => { lastCommitted.current = null; });
  };
  if (!capability.supported) return null;
  return <div className="airgradient-brightness-control"><label><span>{label}</span><input aria-label={label} type="range" min={capability.min} max={capability.max} step={capability.step} value={requested} onChange={(event) => setRequested(Number(event.target.value))} onPointerUp={(event) => commit(Number(event.currentTarget.value))} onKeyUp={(event) => { if (sliderCommitKey(event.key)) commit(Number(event.currentTarget.value)); }} disabled={disabled} /></label><output>{requested}%</output></div>;
}

function AirGradientControls({ device, review, onCommit }: { device: IndoorState['sensors'][1]; review: (item: Review) => void; onCommit: DirectCommand }) {
  const disabled = device.sourceState !== 'AVAILABLE';
  const make = (command: IndoorCommand, current: string, requested: string) =>
    review(requestReview(command, 'Living Room AirGradient', current, requested, 'AIRGRADIENT_LOCAL', device.stateVersion));
  const optionControl = (
    label: string,
    value: string | null,
    options: string[],
    supported: boolean,
    type: 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT' | 'AIRGRADIENT_SET_PM_STANDARD' | 'AIRGRADIENT_SET_LED_MODE',
  ) => supported ? <PopoverOptionButton label={label} options={options} value={value} disabled={disabled} format={airGradientOptionLabel} onSelect={(option) =>
    make({ type, target: 'airgradient_living_room', option }, value === null ? 'Unknown' : airGradientOptionLabel(value), airGradientOptionLabel(option))
  } /> : null;
  const brightnessControls = [
    device.capabilities.displayBrightness.supported ? <AirGradientBrightnessControl key="display" label="Display brightness" value={device.settings.displayBrightness} capability={device.capabilities.displayBrightness} type="AIRGRADIENT_SET_DISPLAY_BRIGHTNESS" disabled={disabled} onCommit={(command) => onCommit(command, device.stateVersion)} /> : null,
    device.capabilities.ledBrightness.supported ? <AirGradientBrightnessControl key="led" label="LED brightness" value={device.settings.ledBrightness} capability={device.capabilities.ledBrightness} type="AIRGRADIENT_SET_LED_BRIGHTNESS" disabled={disabled} onCommit={(command) => onCommit(command, device.stateVersion)} /> : null,
  ].filter((control): control is React.ReactElement => control !== null);
  const displayControls = [
    { key: 'temperature-unit', control: optionControl('Temperature unit', device.settings.displayTemperatureUnit, device.capabilities.displayTemperatureUnits.options, device.capabilities.displayTemperatureUnits.supported, 'AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT') },
    { key: 'pm-standard', control: optionControl('PM standard', device.settings.pmStandard, device.capabilities.pmStandards.options, device.capabilities.pmStandards.supported, 'AIRGRADIENT_SET_PM_STANDARD') },
    { key: 'led-mode', control: optionControl('LED Display', device.settings.ledMode, device.capabilities.ledModes.options, device.capabilities.ledModes.supported, 'AIRGRADIENT_SET_LED_MODE') },
  ].filter((item): item is { key: string; control: React.ReactElement } => item.control !== null);
  return brightnessControls.length || displayControls.length ? <div className="indoor-controls airgradient-controls" aria-label="AirGradient settings"><div className="airgradient-brightness-row">{brightnessControls}</div><div className="airgradient-display-row">{displayControls.map(({ key, control }) => <React.Fragment key={key}>{control}</React.Fragment>)}</div></div> : null;
}

function ReviewDialog({ review, onClose, onSubmit, submitting, error }: { review: Review; onClose: () => void; onSubmit: () => void; submitting: boolean; error: string | null }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  return (
    <div className="help-overlay" role="dialog" aria-modal="true" aria-labelledby="indoor-review-title" onKeyDown={(event) => { if (event.key === 'Escape' && !submitting) onClose(); }}>
      <div className="help-card indoor-review-card">
        <div className="drawer-header"><h2 id="indoor-review-title">Confirm change</h2><button ref={close} type="button" onClick={onClose} disabled={submitting}>Cancel</button></div>
        <p className="control-change-summary"><strong>{review.target}</strong><span>{review.current} → {review.requested}</span><small>{review.dependency === 'NEST_CLOUD' ? 'Nest cloud' : review.dependency === 'COWAY_CLOUD' ? 'Coway cloud' : review.dependency === 'MULTI_CLOUD' ? 'Nest + Coway clouds' : 'AirGradient local'} · updates after confirmation</small></p>
        {error ? <p className="action-error" role="alert">{error}</p> : null}
        <button className="confirm-action" type="button" onClick={onSubmit} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

export function IndoorScreen({ bootstrap }: { bootstrap: Bootstrap }) {
  const [indoorSnapshot, setIndoorSnapshot] = useState(bootstrap.indoor);
  const indoor = indoorSnapshot;
  const [selection, setSelection] = useState<HistorySelection>({ window: '1h' });
  const [history, setHistory] = useState<Record<string, TimeSeries>>({});
  const [historyUpdate, setHistoryUpdate] = useState<HistoryUpdateState>({ status: 'LOADING', updatedAt: null });
  const [customOpen, setCustomOpen] = useState(false);
  const [customMode, setCustomMode] = useState<'relative' | 'exact'>('relative');
  const [relativeValue, setRelativeValue] = useState('12');
  const [relativeUnit, setRelativeUnit] = useState<'hours' | 'days' | 'weeks' | 'months'>('hours');
  const [exactStart, setExactStart] = useState('');
  const [exactEnd, setExactEnd] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directActionError, setDirectActionError] = useState<string | null>(null);
  const [ventilationActionId, setVentilationActionId] = useState<string | null>(null);
  const [ventilationOptimisticEndsAt, setVentilationOptimisticEndsAt] = useState<string | null>(null);
  const [cancellingVentilation, setCancellingVentilation] = useState(false);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const aranet = indoor.sensors[0];
  const airgradient = indoor.sensors[1];
  const thermostat = indoor.thermostats[0];
  const pendingVentilation = indoor.actions.filter((action) => action.target === 'indoor_environment' && action.status === 'PENDING').at(-1);
  const ventilationPending = pendingVentilation !== undefined;
  const ventilationActive = ventilationPending || ventilationActionId !== null;
  const ventilationEndsAt = pendingVentilation?.endsAt ?? ventilationOptimisticEndsAt;
  const ventilationAvailable = thermostat.sourceState === 'AVAILABLE'
    && thermostat.capabilities.fanTimerMinutes.supported
    && thermostat.capabilities.fanTimerMinutes.values.includes(0)
    && thermostat.capabilities.fanTimerMinutes.values.some((minutes) => minutes > 0)
    && indoor.purifiers.every((purifier) => purifier.sourceState === 'AVAILABLE'
      && purifier.capabilities.presets.supported
      && purifier.capabilities.presets.options.includes('RAPID'));
  useEffect(() => {
    setIndoorSnapshot((current) => ({
      ...bootstrap.indoor,
      actions: mergeIndoorActionHistory(current.actions, bootstrap.indoor.actions),
    }));
  }, [bootstrap.indoor]);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const response = await fetch('/api/v1/bootstrap');
        const body: unknown = await response.json();
        const parsed = BootstrapSchema.safeParse((body as { data?: unknown }).data);
        if (!cancelled && response.ok && parsed.success) {
          setIndoorSnapshot((current) => ({
            ...parsed.data.indoor,
            actions: mergeIndoorActionHistory(current.actions, parsed.data.indoor.actions),
          }));
          if (ventilationActionId) {
            const tracked = parsed.data.indoor.actions.find((action) => action.actionId === ventilationActionId);
            if (tracked && tracked.status !== 'PENDING') {
              setVentilationActionId(null);
              setVentilationOptimisticEndsAt(null);
              setCancellingVentilation(false);
            }
          }
        }
      } catch { /* retain the last confirmed control state */ }
      if (!cancelled) timer = window.setTimeout(() => void refresh(), 2_000);
    };
    timer = window.setTimeout(() => void refresh(), 2_000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [ventilationActionId]);
  useEffect(() => {
    if (!ventilationActive) return;
    setCountdownNow(Date.now());
    const interval = window.setInterval(() => setCountdownNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [ventilationActive]);
  const metrics = useMemo<HistoryMetric[]>(() => [
    { alias: 'airgradient_living_room.co2', label: 'AirGradient CO₂', thresholds: [{ value: 600, tone: 'blue' }, { value: 800, tone: 'yellow' }, { value: 1000, tone: 'red' }], scale: { fixedMin: 400, fixedMax: 1400, ticks: [400, 600, 800, 1000, 1200, 1400], digits: 0 } },
    { alias: 'airgradient_living_room.pm25', secondaryAlias: 'airgradient_living_room.pm10', secondaryLabel: 'PM10', label: 'AirGradient particulate matter', thresholds: [{ value: 5, tone: 'yellow' }, { value: 15, tone: 'red' }], scale: { minSpan: 20, hardMin: 0, digits: 0 } },
    { alias: 'airgradient_living_room.tvoc_index', label: 'AirGradient TVOC index', thresholds: [{ value: 100, tone: 'blue' }, { value: 150, tone: 'yellow' }, { value: 250, tone: 'red' }], scale: { fixedMin: 0, fixedMax: 500, ticks: [0, 100, 200, 300, 400, 500], digits: 0 } },
    { alias: 'airgradient_living_room.nox_index', label: 'AirGradient NOx index', thresholds: [{ value: 20, tone: 'yellow' }, { value: 150, tone: 'red' }], scale: { fixedMin: 0, fixedMax: 500, ticks: [0, 100, 200, 300, 400, 500], digits: 0 } },
    { alias: 'airgradient_living_room.temperature', label: 'AirGradient temperature', thresholds: [{ value: 65, tone: 'dark-blue' }, { value: 68, tone: 'light-blue' }, { value: 72, tone: 'yellow' }, { value: 75, tone: 'red' }], scale: { fixedMin: 60, fixedMax: 80, ticks: [60, 65, 70, 75, 80], digits: 0 } },
    { alias: 'airgradient_living_room.humidity', label: 'AirGradient humidity', thresholds: [{ value: 30, tone: 'light-blue' }, { value: 50, tone: 'light-blue' }], scale: { fixedMin: 0, fixedMax: 100, ticks: [0, 20, 40, 60, 80, 100], digits: 0 } },
  ], []);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    setHistory({});
    setHistoryUpdate({ status: 'LOADING', updatedAt: null });
    const refresh = async () => {
      const now = new Date();
      const querySelection = selection.window === 'custom' && selection.mode === 'relative'
        ? { start: new Date(now.getTime() - selection.durationMs).toISOString(), end: now.toISOString() }
        : selection.window === 'custom'
          ? { start: selection.start, end: selection.end }
          : null;
      const historyAliases = metrics.flatMap(({ alias, secondaryAlias }) => secondaryAlias ? [alias, secondaryAlias] : [alias]);
      const items = await Promise.all(historyAliases.map(async (alias) => {
      try {
        const params = new URLSearchParams({ metric: alias, window: selection.window });
        if (querySelection) {
          params.set('start', querySelection.start);
          params.set('end', querySelection.end);
        }
        const response = await fetch(`/api/v1/history?${params.toString()}`);
        if (!response.ok) return null;
        const parsed = HistoryResponseSchema.safeParse(await response.json());
        return parsed.success ? [alias, parsed.data.data] as const : null;
      } catch { return null; }
      }));
      if (!active) return;
      const successful = items.filter((item) => item !== null);
      if (successful.length) setHistory((current) => ({ ...current, ...Object.fromEntries(successful) }));
      setHistoryUpdate((current) => successful.length === historyAliases.length
        ? { status: 'CURRENT', updatedAt: now.toISOString() }
        : { status: 'STALE', updatedAt: current.updatedAt });
    };
    const polling = selection.window !== 'custom' || selection.mode === 'relative';
    const schedule = () => {
      if (!polling || document.visibilityState === 'hidden' || !active) return;
      timer = window.setTimeout(() => { void refresh().finally(schedule); }, nextHistoryRefreshDelay(Date.now()));
    };
    const onVisibilityChange = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (document.visibilityState === 'visible' && polling) void refresh().finally(schedule);
    };
    void refresh().finally(schedule);
    if (polling) document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [metrics, selection]);
  const applyCustomRange = () => {
    setRangeError(null);
    let start: Date;
    let end: Date;
    if (customMode === 'relative') {
      const value = Number(relativeValue);
      if (!Number.isFinite(value) || value <= 0) {
        setRangeError('Enter a duration greater than zero.');
        return;
      }
      const unitMs = { hours: 3_600_000, days: 86_400_000, weeks: 604_800_000, months: 2_592_000_000 }[relativeUnit];
      end = new Date();
      start = new Date(end.getTime() - value * unitMs);
    } else {
      start = new Date(exactStart);
      end = new Date(exactEnd);
      if (!exactStart || !exactEnd || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() > Date.now()) {
        setRangeError('Choose a valid start and end time in the past.');
        return;
      }
    }
    setSelection(customMode === 'relative'
      ? { window: 'custom', mode: 'relative', durationMs: end.getTime() - start.getTime() }
      : { window: 'custom', mode: 'exact', start: start.toISOString(), end: end.toISOString() });
    setCustomOpen(false);
  };
  const acceptCommand = async (command: IndoorCommand, stateVersion: string) => {
    const response = await fetch('/api/v1/indoor/actions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), expectedStateVersion: stateVersion, confirmed: true, command }),
      });
    const body: unknown = await response.json();
    const parsed = IndoorActionAcceptedSchema.safeParse((body as { data?: IndoorActionAccepted }).data);
    if (!response.ok || !parsed.success) throw new Error((body as { error?: { message?: string } }).error?.message ?? 'The command was not accepted.');
    if (command.type === 'VENTILATE') {
      setVentilationActionId(parsed.data.actionId);
      setVentilationOptimisticEndsAt(new Date(Date.parse(parsed.data.acceptedAt) + 30 * 60_000).toISOString());
    }
    if (command.type === 'CANCEL_VENTILATION') {
      setVentilationActionId(parsed.data.actionId);
      setCancellingVentilation(true);
    }
  };
  const submitDirect: DirectCommand = async (command, stateVersion) => {
    setDirectActionError(null);
    try {
      await acceptCommand(command, stateVersion);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The command failed.';
      setDirectActionError(message);
      throw cause;
    }
  };
  const submit = async () => {
    if (!review) return;
    setSubmitting(true); setError(null);
    try {
      await acceptCommand(review.command, review.stateVersion);
      setReview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The command failed.'); }
    finally { setSubmitting(false); }
  };
  return (
    <main className="dashboard indoor-dashboard" id="indoor">
      <section className="hero-row"><div><span className="panel-eyebrow">INDOOR / HOME ASSISTANT</span><h1>Indoor environment</h1></div><div className="hero-state"><div className="ventilation-controls"><button className={`ventilate-button${ventilationActive ? ' ventilate-button-active' : ''}`} type="button" disabled={!ventilationAvailable || ventilationActive} onClick={() => setReview(requestReview(
        { type: 'VENTILATE', target: 'indoor_environment', durationMinutes: 30 },
        'Indoor environment',
        `Nest fan ${thermostat.fanTimerEndsAt ? 'on' : 'off'}; Coways ${indoor.purifiers.map((purifier) => purifier.power ? `speed ${purifier.speed ?? 'unknown'}` : 'off').join(' / ')}`,
        'Both Coways Rapid + Nest fan for 30 minutes',
        'MULTI_CLOUD',
        indoorVentilationStateVersion(indoor),
      ))}>{ventilationActive ? 'Ventilating…' : 'Ventilate'}</button>{ventilationActive && ventilationEndsAt ? <span className="ventilation-remaining" role="timer">{ventilationTimeRemaining(ventilationEndsAt, countdownNow)} remaining</span> : null}{ventilationActive ? <button className="cancel-ventilation-button" type="button" disabled={cancellingVentilation} onClick={() => setReview(requestReview(
        { type: 'CANCEL_VENTILATION', target: 'indoor_environment' },
        'Indoor environment',
        'Ventilating',
        'Cancel and restore prior fan states',
        'MULTI_CLOUD',
        indoorVentilationStateVersion(indoor),
      ))}>{cancellingVentilation ? 'Cancelling…' : 'Cancel ventilation'}</button> : null}</div><StateBadge severity={indoor.alerts.some((item) => item.severity === 'CRIT') ? 'CRIT' : indoor.alerts.length ? 'WARN' : 'OK'} label={`${indoor.alerts.length} active alert${indoor.alerts.length === 1 ? '' : 's'}`} /><span>Updated {bootstrap.generatedAt.slice(11, 19)} UTC</span></div></section>
      {indoor.alerts.length ? <section className="indoor-alerts" aria-label="Indoor alerts">{indoor.alerts.map((alert) => <div key={alert.id}><StateBadge severity={alert.severity} /><strong>{alert.kind.replaceAll('_', ' ')}</strong><span>{alert.summary}</span></div>)}</section> : null}
      {directActionError ? <p className="action-error indoor-action-error" role="alert">{directActionError}</p> : null}
      <section className="indoor-current-grid" id="indoor-current" aria-label="Current indoor readings">
        <section className="panel indoor-summary-panel" aria-label="Indoor summary"><div className="panel-body indoor-summary-row"><div className="indoor-reading-grid indoor-primary-readings"><Metric label="TEMPERATURE" value={display(thermostat.currentTemperature, 1)} unit="°F" detail={freshnessDetail(thermostat.currentTemperature)} /><Metric label="HUMIDITY" value={display(airgradient.readings.humidity)} unit="%" detail={freshnessDetail(airgradient.readings.humidity)} /><Metric label="CO₂" value={display(airgradient.readings.co2)} unit="ppm" detail={freshnessDetail(airgradient.readings.co2)} /><Metric label="PM2.5" value={display(airgradient.readings.pm25)} unit="µg/m³" detail={freshnessDetail(airgradient.readings.pm25)} /><Metric label="PM10" value={display(airgradient.readings.pm10)} unit="µg/m³" detail={freshnessDetail(airgradient.readings.pm10)} /><Metric label="TVOC INDEX" value={display(airgradient.readings.tvocIndex)} detail={freshnessDetail(airgradient.readings.tvocIndex)} /><Metric label="NOx INDEX" value={display(airgradient.readings.noxIndex)} detail={freshnessDetail(airgradient.readings.noxIndex)} /></div><StateBadge severity={sourceSeverity(airgradient.sourceState)} /></div></section>
      </section>
      <section className="indoor-history" aria-labelledby="indoor-history-title">
        <div className="section-heading"><div><h2 id="indoor-history-title">Trend History</h2><span className={`history-update-status history-update-${historyUpdate.status.toLowerCase()}`} role="status">{historyUpdate.status === 'LOADING' ? 'Loading history…' : historyUpdate.status === 'STALE' ? `Update failed · retaining data${historyUpdate.updatedAt ? ` from ${historyUpdatedTime(historyUpdate.updatedAt)} PT` : ''}` : `Updated ${historyUpdatedTime(historyUpdate.updatedAt!)} PT`}</span></div><div className="history-window" role="group" aria-label="History window">{WINDOWS.map((item) => <button type="button" aria-pressed={selection.window === item} onClick={() => { setSelection({ window: item }); setCustomOpen(false); }} key={item}>{item}</button>)}<button type="button" aria-pressed={selection.window === 'custom'} aria-expanded={customOpen} onClick={() => setCustomOpen((open) => !open)}>Custom</button></div></div>
        {customOpen ? <form className="history-custom-range" onSubmit={(event) => { event.preventDefault(); applyCustomRange(); }}>
          <div className="history-custom-mode" role="group" aria-label="Custom range type">
            <button type="button" aria-pressed={customMode === 'relative'} onClick={() => setCustomMode('relative')}>Duration</button>
            <button type="button" aria-pressed={customMode === 'exact'} onClick={() => setCustomMode('exact')}>Start / end</button>
          </div>
          {customMode === 'relative' ? <div className="history-custom-fields">
            <label>Last<input type="number" min="0.01" step="any" value={relativeValue} onChange={(event) => setRelativeValue(event.target.value)} /></label>
            <label>Unit<select value={relativeUnit} onChange={(event) => setRelativeUnit(event.target.value as typeof relativeUnit)}><option value="hours">Hours</option><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months (30 days)</option></select></label>
          </div> : <div className="history-custom-fields">
            <label>Start<input type="datetime-local" value={exactStart} onChange={(event) => setExactStart(event.target.value)} /></label>
            <label>End<input type="datetime-local" value={exactEnd} onChange={(event) => setExactEnd(event.target.value)} /></label>
          </div>}
          {rangeError ? <p className="history-range-error" role="alert">{rangeError}</p> : null}
          <button className="history-apply-range" type="submit">Apply to all graphs</button>
        </form> : null}
        <div className="indoor-graph-grid">{metrics.map((metric) => <HistoryGraph
          key={metric.alias}
          series={history[metric.alias]}
          label={metric.label}
          thresholds={metric.thresholds}
          scale={metric.scale}
          {...(metric.secondaryAlias && history[metric.secondaryAlias] ? { secondarySeries: history[metric.secondaryAlias] } : {})}
          {...(metric.secondaryLabel ? { secondaryLabel: metric.secondaryLabel } : {})}
        />)}</div>
      </section>
      <section className="indoor-settings-grid" aria-label="Indoor device settings">
        <Panel title="AirGradient settings" eyebrow="SENSOR / LOCAL" severity={sourceSeverity(airgradient.sourceState)} freshness={panelFreshness(airgradient.readings.co2.metadata.freshness)} statusDetail={`DISPLAY ${airgradient.settings.displayBrightness ?? '—'}% · LED ${airgradient.settings.ledBrightness ?? '—'}%`}>
          <AirGradientControls device={airgradient} review={setReview} onCommit={submitDirect} />
        </Panel>
        <Panel title="Living Room Nest" eyebrow="THERMOSTAT / CLOUD" severity={sourceSeverity(thermostat.sourceState)} freshness={panelFreshness(thermostat.currentTemperature.metadata.freshness)} statusDetail={`${thermostat.heatSetpointF ?? '—'}–${thermostat.coolSetpointF ?? '—'}°F · ${thermostat.hvacMode ?? 'NO DATA'}`}>
          <ThermostatControls thermostat={thermostat} review={setReview} onCommit={submitDirect} />
        </Panel>
      </section>
      <section className="purifier-grid" aria-label="Air purifiers">
        {indoor.purifiers.map((purifier) => <Panel key={purifier.alias} title={`${purifier.room === 'living_room' ? 'Living Room' : 'Bedroom'} Coway`} eyebrow="AIRMEGA 250S / CLOUD" severity={sourceSeverity(purifier.sourceState)} freshness={panelFreshness(purifier.readings.pm25.metadata.freshness)} statusDetail={`${purifier.power === null ? 'NO DATA' : purifier.power ? 'ON' : 'OFF'} · ${purifier.preset ?? '—'} · SPEED ${purifier.speed ?? '—'}`}><div className="indoor-reading-grid"><Metric label="PM2.5" value={display(purifier.readings.pm25)} unit="µg/m³" /><Metric label="PM10" value={display(purifier.readings.pm10)} unit="µg/m³" /><Metric label="AQI" value={display(purifier.readings.aqi)} /><Metric label="FILTER" value={display(purifier.readings.filterLife)} unit="%" /></div><PurifierControls purifier={purifier} review={setReview} /></Panel>)}
      </section>
      <section className="indoor-comparison-grid" aria-label="Indoor comparison and fallback">
        <Panel className="aranet-panel" title="Living Room Aranet" eyebrow="COMPARISON / FALLBACK" severity={sourceSeverity(aranet.sourceState)} freshness={panelFreshness(aranet.readings.co2.metadata.freshness)} statusDetail={`CO₂ ${display(aranet.readings.co2)} ppm · ${display(aranet.readings.temperature, 1)}°F`}>
          <div className="indoor-reading-grid"><Metric label="TEMPERATURE" value={display(aranet.readings.temperature, 1)} unit="°F" /><Metric label="HUMIDITY" value={display(aranet.readings.humidity)} unit="%" /><Metric label="PRESSURE" value={display(aranet.readings.pressure)} unit="hPa" /><Metric label="CO₂" value={display(aranet.readings.co2)} unit="ppm" /><Metric label="BATTERY" value={display(aranet.readings.battery)} unit="%" /></div>
        </Panel>
      </section>
      {indoor.actions.length ? <Panel className="indoor-action-history" title="History" eyebrow="INDOOR CONTROLS" severity={actionHistorySeverity(indoor.actions)} statusDetail={`${indoor.actions.length} ACTION${indoor.actions.length === 1 ? '' : 'S'}`}><section className="indoor-action-status" aria-live="polite" aria-label="Recent indoor commands">{indoor.actions.slice(-5).reverse().map((action) => <div className={`indoor-action-status-entry indoor-action-status-${action.status.toLowerCase()}`} key={action.actionId}><StateBadge severity={action.status === 'SUCCEEDED' ? 'OK' : action.status === 'PENDING' ? 'INFO' : 'CRIT'} label={action.status} /><div><strong>{action.target.replaceAll('_', ' ')}</strong>{action.message ? <small>{action.message}</small> : null}<span className="indoor-action-times"><time dateTime={action.acceptedAt}>Accepted {actionTimestamp(action.acceptedAt)}</time>{action.resolvedAt ? <time dateTime={action.resolvedAt}>Resolved {actionTimestamp(action.resolvedAt)}</time> : null}</span></div></div>)}</section></Panel> : null}
      {review ? <ReviewDialog review={review} onClose={() => { setReview(null); setError(null); }} onSubmit={() => void submit()} submitting={submitting} error={error} /> : null}
    </main>
  );
}
