import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Bootstrap, IndoorActionAccepted, IndoorCommand, IndoorState, TimeSeries,
} from '../shared/contracts.js';
import { HistoryResponseSchema, IndoorActionAcceptedSchema } from '../shared/contracts.js';
import { Metric, Panel, StateBadge } from './components.js';
import { computeHistoryDomain, smoothSvgPath, type HistoryScale } from './indoor-chart.js';

const WINDOWS = ['1h', '24h', '7d', '30d'] as const;
type Window = typeof WINDOWS[number];
type Review = { command: IndoorCommand; target: string; current: string; requested: string; dependency: 'NEST_CLOUD' | 'COWAY_CLOUD'; stateVersion: string };
type IndoorReading = IndoorState['sensors'][0]['readings']['temperature'];
type ThermostatState = IndoorState['thermostats'][0];
type PurifierState = IndoorState['purifiers'][number];
type ThresholdTone = 'blue' | 'light-blue' | 'dark-blue' | 'yellow' | 'red';
type HistoryThreshold = { value: number; tone: ThresholdTone };
type HistoryMetric = { alias: string; label: string; thresholds: HistoryThreshold[]; scale: HistoryScale };

function display(reading: IndoorReading, digits = 0) {
  return reading.value === null ? '—' : reading.value.toFixed(digits);
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
    <Panel title="Indoor environment" eyebrow="LIVING ROOM" severity={severity} freshness={panelFreshness(room.freshness)}>
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

function historyTimeLabel(timestamp: string, window: TimeSeries['window']) {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = window === '30d'
    ? { month: 'short', day: 'numeric' }
    : window === '7d'
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

export function HistoryGraph({ series, label, thresholds, scale }: { series: TimeSeries | undefined; label: string; thresholds: HistoryThreshold[]; scale: HistoryScale }) {
  const plot = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!series || series.points.length === 0) return <div className="indoor-no-data" role="status">NO DATA · {label}</div>;
  const values = series.points.map((point) => point.value);
  const { min, max, ticks } = computeHistoryDomain(values, scale);
  const range = max - min;
  const plotLeft = 0;
  const plotRight = 100;
  const plotTop = 8;
  const plotBottom = 92;
  const y = (value: number) => plotBottom - ((value - min) / range) * (plotBottom - plotTop);
  const firstTimestamp = Date.parse(series.points[0]!.timestamp);
  const lastTimestamp = Date.parse(series.points.at(-1)!.timestamp);
  const timeRange = Math.max(lastTimestamp - firstTimestamp, 1);
  const chartPoints = series.points.map((point) => {
    const x = values.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + ((Date.parse(point.timestamp) - firstTimestamp) / timeRange) * (plotRight - plotLeft);
    return { x, y: y(point.value) };
  });
  const xTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const timestamp = new Date(firstTimestamp + timeRange * ratio).toISOString();
    return { x: plotLeft + ratio * (plotRight - plotLeft), timestamp };
  });
  const hoveredPoint = hoveredIndex === null ? null : series.points[hoveredIndex]!;
  const hoveredChartPoint = hoveredIndex === null ? null : chartPoints[hoveredIndex]!;
  const selectNearestPoint = (clientX: number) => {
    const bounds = plot.current?.getBoundingClientRect();
    if (!bounds) return;
    const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1) * 100;
    const nearest = chartPoints.reduce((best, point, index) =>
      Math.abs(point.x - x) < Math.abs(chartPoints[best]!.x - x) ? index : best, 0);
    setHoveredIndex(nearest);
  };
  const points = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const smoothMetric = [
    'aranet_living_room.temperature',
    'aranet_living_room.humidity',
    'aranet_living_room.co2',
  ].includes(series.metric) && chartPoints.length > 2;
  const valueLabel = (value: number) => value.toFixed(scale.digits ?? 0);
  const summary = `${label}, ${series.window}, ${values.length} samples, latest ${values.at(-1)} ${series.unit}. Thresholds ${thresholds.map((threshold) => threshold.value).join(', ')} ${series.unit}.`;
  return (
    <figure className="indoor-history-graph">
      <figcaption><strong>{label}</strong><span>{valueLabel(values.at(-1)!)} {series.unit}</span></figcaption>
      <div className="history-chart">
        <div className="y-axis-labels" aria-hidden="true">
          <span className="y-axis-unit">{series.unit}</span>
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
          onFocus={() => setHoveredIndex((current) => current ?? series.points.length - 1)}
          onBlur={() => setHoveredIndex(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const direction = event.key === 'ArrowLeft' ? -1 : 1;
            setHoveredIndex((current) => Math.min(Math.max((current ?? series.points.length - 1) + direction, 0), series.points.length - 1));
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {ticks.map((value) => <line key={value} x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} className="y-axis-grid" />)}
            {xTicks.map(({ x }) => <line key={x} x1={x} x2={x} y1={plotTop} y2={plotBottom} className="x-axis-grid" />)}
            <line x1={plotLeft} x2={plotLeft} y1={plotTop} y2={plotBottom} className="y-axis-line" />
            {thresholds.filter(({ value }) => value >= min && value <= max).map(({ value, tone }) =>
              <line key={value} x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} className={`threshold-line threshold-tone-${tone}`} />,
            )}
            {smoothMetric
              ? <path d={smoothSvgPath(chartPoints)} className="history-line history-line-smoothed" vectorEffect="non-scaling-stroke" />
              : <polyline points={points} className="history-line" vectorEffect="non-scaling-stroke" />}
            {hoveredChartPoint ? <>
              <line x1={hoveredChartPoint.x} x2={hoveredChartPoint.x} y1={plotTop} y2={plotBottom} className="history-crosshair" />
              <circle cx={hoveredChartPoint.x} cy={hoveredChartPoint.y} r="1.35" className="history-hover-point" vectorEffect="non-scaling-stroke" />
            </> : null}
          </svg>
          {hoveredPoint && hoveredChartPoint ? <div
            className={`history-tooltip${hoveredChartPoint.x > 62 ? ' history-tooltip-left' : ''}`}
            style={{ left: `${hoveredChartPoint.x}%`, top: `${Math.min(Math.max(hoveredChartPoint.y, 18), 72)}%` }}
            role="status"
          >
            <strong>{historyTooltipTime(hoveredPoint.timestamp)}</strong>
            <span><i aria-hidden="true" />{valueLabel(hoveredPoint.value)} {series.unit}</span>
          </div> : null}
        </div>
        <div className="x-axis-labels" aria-hidden="true">
          {xTicks.map(({ x, timestamp }, index) => <span key={x} style={{ left: `${x}%` }}>{index === xTicks.length - 1 ? 'Current' : historyTimeLabel(timestamp, series.window)}</span>)}
        </div>
      </div>
    </figure>
  );
}

function ThermostatControls({ thermostat, review }: { thermostat: ThermostatState; review: (item: Review) => void }) {
  const disabled = thermostat.sourceState !== 'AVAILABLE';
  const min = thermostat.capabilities.setpointMinF ?? 50;
  const max = thermostat.capabilities.setpointMaxF ?? 90;
  const step = thermostat.capabilities.setpointStepF ?? 1;
  const [heat, setHeat] = useState(thermostat.heatSetpointF ?? 68);
  const [cool, setCool] = useState(thermostat.coolSetpointF ?? 74);
  return (
    <div className="indoor-controls">
      {thermostat.capabilities.hvacModes.supported ? <label>HVAC mode<select disabled={disabled} value={thermostat.hvacMode ?? ''} onChange={(event) => {
        const mode = event.target.value as NonNullable<ThermostatState['hvacMode']>;
        review(requestReview({ type: 'NEST_SET_HVAC_MODE', target: 'nest_living_room', mode }, 'Living Room Nest', thermostat.hvacMode ?? 'Unknown', mode, 'NEST_CLOUD', thermostat.stateVersion));
      }}>{thermostat.capabilities.hvacModes.options.map((mode) => <option key={mode}>{mode}</option>)}</select></label> : null}
      {thermostat.capabilities.setpointShapes.includes('RANGE') ? <form onSubmit={(event) => {
        event.preventDefault();
        review(requestReview({ type: 'NEST_SET_SETPOINT', target: 'nest_living_room', setpoint: { shape: 'RANGE', heatTemperatureF: heat, coolTemperatureF: cool } }, 'Living Room Nest', `${thermostat.heatSetpointF ?? '—'}–${thermostat.coolSetpointF ?? '—'}°F`, `${heat}–${cool}°F`, 'NEST_CLOUD', thermostat.stateVersion));
      }}><label>Heat setpoint<input aria-label="Nest heat setpoint" type="number" min={min} max={max} step={step} value={heat} onChange={(event) => setHeat(Number(event.target.value))} disabled={disabled} /></label><label>Cool setpoint<input aria-label="Nest cool setpoint" type="number" min={min} max={max} step={step} value={cool} onChange={(event) => setCool(Number(event.target.value))} disabled={disabled} /></label><button type="submit" disabled={disabled || heat >= cool}>Review range</button></form> : null}
      {thermostat.capabilities.fanTimerMinutes.supported ? <div className="control-button-row" aria-label="Nest fan timer">{thermostat.capabilities.fanTimerMinutes.values.map((minutes) => <button type="button" disabled={disabled} key={minutes} onClick={() => review(requestReview({ type: 'NEST_SET_FAN_TIMER', target: 'nest_living_room', durationMinutes: minutes }, 'Living Room Nest', thermostat.fanTimerEndsAt ? 'Running' : 'Off', minutes === 0 ? 'Off' : `${minutes} minutes`, 'NEST_CLOUD', thermostat.stateVersion))}>{minutes === 0 ? 'Fan off' : `Fan ${minutes}m`}</button>)}</div> : null}
    </div>
  );
}

function PurifierControls({ purifier, review }: { purifier: PurifierState; review: (item: Review) => void }) {
  const disabled = purifier.sourceState !== 'AVAILABLE';
  const make = (command: IndoorCommand, current: string, requested: string) => review(requestReview(command, purifier.room === 'living_room' ? 'Living Room Coway' : 'Bedroom Coway', current, requested, 'COWAY_CLOUD', purifier.stateVersion));
  return (
    <div className="indoor-controls">
      {purifier.capabilities.power.supported ? <button type="button" disabled={disabled} onClick={() => make({ type: 'COWAY_SET_POWER', target: purifier.alias, power: !purifier.power }, purifier.power ? 'On' : 'Off', purifier.power ? 'Off' : 'On')}>{purifier.power ? 'Review power off' : 'Review power on'}</button> : null}
      {purifier.capabilities.speeds.supported ? <label>Speed<select disabled={disabled} value={purifier.speed ?? ''} onChange={(event) => make({ type: 'COWAY_SET_SPEED', target: purifier.alias, speed: Number(event.target.value) as 1 | 2 | 3 }, String(purifier.speed ?? 'Unknown'), event.target.value)}>{purifier.capabilities.speeds.values.map((value) => <option value={value} key={value}>{value}</option>)}</select></label> : null}
      {purifier.capabilities.presets.supported ? <label>Preset<select disabled={disabled} value={purifier.preset ?? ''} onChange={(event) => make({ type: 'COWAY_SET_PRESET', target: purifier.alias, preset: event.target.value }, purifier.preset ?? 'Unknown', event.target.value)}>{purifier.capabilities.presets.options.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
      {purifier.capabilities.timerMinutes.supported ? <label>Timer<select disabled={disabled} defaultValue="" onChange={(event) => make({ type: 'COWAY_SET_TIMER', target: purifier.alias, durationMinutes: Number(event.target.value) }, purifier.timerEndsAt ? 'Running' : 'Off', Number(event.target.value) === 0 ? 'Off' : `${event.target.value} minutes`)}><option value="" disabled>Choose</option>{purifier.capabilities.timerMinutes.values.map((value) => <option value={value} key={value}>{value === 0 ? 'Off' : `${value} min`}</option>)}</select></label> : null}
      {purifier.capabilities.lightOptions.supported ? <label>Light<select disabled={disabled} value={purifier.light ?? ''} onChange={(event) => make({ type: 'COWAY_SET_LIGHT', target: purifier.alias, light: event.target.value }, purifier.light ?? 'Unknown', event.target.value)}>{purifier.capabilities.lightOptions.options.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
      {purifier.capabilities.buttonLock.supported ? <button type="button" disabled={disabled} onClick={() => make({ type: 'COWAY_SET_BUTTON_LOCK', target: purifier.alias, locked: !purifier.buttonLock }, purifier.buttonLock ? 'Locked' : 'Unlocked', purifier.buttonLock ? 'Unlocked' : 'Locked')}>Review {purifier.buttonLock ? 'unlock' : 'lock'}</button> : null}
      {purifier.capabilities.sensitivityOptions.supported ? <label>Sensitivity<select disabled={disabled} value={purifier.sensitivity ?? ''} onChange={(event) => make({ type: 'COWAY_SET_SENSITIVITY', target: purifier.alias, sensitivity: event.target.value }, purifier.sensitivity ?? 'Unknown', event.target.value)}>{purifier.capabilities.sensitivityOptions.options.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
    </div>
  );
}

function ReviewDialog({ review, onClose, onSubmit, submitting, error }: { review: Review; onClose: () => void; onSubmit: () => void; submitting: boolean; error: string | null }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  return (
    <div className="help-overlay" role="dialog" aria-modal="true" aria-labelledby="indoor-review-title" onKeyDown={(event) => { if (event.key === 'Escape' && !submitting) onClose(); }}>
      <div className="help-card indoor-review-card">
        <div className="drawer-header"><h2 id="indoor-review-title">Review device command</h2><button ref={close} type="button" onClick={onClose} disabled={submitting}>Cancel</button></div>
        <dl><dt>Target</dt><dd>{review.target}</dd><dt>Current state</dt><dd>{review.current}</dd><dt>Requested state</dt><dd>{review.requested}</dd><dt>Dependency</dt><dd>{review.dependency === 'NEST_CLOUD' ? 'Google Nest cloud' : 'Coway IoCare cloud'}</dd></dl>
        <p className="control-warning">The dashboard will wait for Home Assistant to report convergence. It will not change the displayed device state optimistically.</p>
        {error ? <p className="action-error" role="alert">{error}</p> : null}
        <button className="confirm-action" type="button" onClick={onSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Confirm command'}</button>
      </div>
    </div>
  );
}

export function IndoorScreen({ bootstrap }: { bootstrap: Bootstrap }) {
  const { indoor } = bootstrap;
  const [window, setWindow] = useState<Window>('1h');
  const [history, setHistory] = useState<Record<string, TimeSeries>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aranet = indoor.sensors[0];
  const thermostat = indoor.thermostats[0];
  const metrics = useMemo<HistoryMetric[]>(() => [
    { alias: 'aranet_living_room.temperature', label: 'Temperature', thresholds: [{ value: 60, tone: 'blue' }, { value: 80, tone: 'red' }], scale: { fixedMin: 60, fixedMax: 80, ticks: [60, 65, 70, 75, 80], digits: 0 } },
    { alias: 'aranet_living_room.humidity', label: 'Humidity', thresholds: [{ value: 20, tone: 'dark-blue' }, { value: 30, tone: 'light-blue' }, { value: 60, tone: 'light-blue' }, { value: 70, tone: 'dark-blue' }], scale: { fixedMin: 0, fixedMax: 100, ticks: [0, 20, 40, 60, 80, 100], digits: 0 } },
    { alias: 'aranet_living_room.co2', label: 'CO₂', thresholds: [{ value: 900, tone: 'yellow' }, { value: 1000, tone: 'red' }], scale: { fixedMin: 400, fixedMax: 1400, ticks: [400, 600, 800, 1000, 1200, 1400], digits: 0 } },
    { alias: 'coway_living_room.pm25', label: 'Living Room PM2.5', thresholds: [{ value: 5, tone: 'yellow' }, { value: 15, tone: 'red' }], scale: { minSpan: 20, hardMin: 0, digits: 0 } },
  ], []);
  useEffect(() => {
    let active = true;
    void Promise.all(metrics.map(async ({ alias }) => {
      try {
        const response = await fetch(`/api/v1/history?metric=${encodeURIComponent(alias)}&window=${window}`);
        const parsed = HistoryResponseSchema.safeParse(await response.json());
        return parsed.success ? [alias, parsed.data.data] as const : null;
      } catch { return null; }
    })).then((items) => { if (active) setHistory(Object.fromEntries(items.filter((item) => item !== null))); });
    return () => { active = false; };
  }, [metrics, window]);
  const submit = async () => {
    if (!review) return;
    setSubmitting(true); setError(null);
    try {
      const response = await fetch('/api/v1/indoor/actions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), expectedStateVersion: review.stateVersion, confirmed: true, command: review.command }),
      });
      const body: unknown = await response.json();
      const parsed = IndoorActionAcceptedSchema.safeParse((body as { data?: IndoorActionAccepted }).data);
      if (!response.ok || !parsed.success) throw new Error((body as { error?: { message?: string } }).error?.message ?? 'The command was not accepted.');
      setReview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The command failed.'); }
    finally { setSubmitting(false); }
  };
  return (
    <main className="dashboard indoor-dashboard" id="indoor">
      <section className="hero-row"><div><span className="panel-eyebrow">INDOOR / HOME ASSISTANT</span><h1>Indoor environment</h1></div><div className="hero-state"><StateBadge severity={indoor.alerts.some((item) => item.severity === 'CRIT') ? 'CRIT' : indoor.alerts.length ? 'WARN' : 'OK'} label={`${indoor.alerts.length} active alert${indoor.alerts.length === 1 ? '' : 's'}`} /><span>Updated {bootstrap.generatedAt.slice(11, 19)} UTC</span></div></section>
      {indoor.alerts.length ? <section className="indoor-alerts" aria-label="Indoor alerts">{indoor.alerts.map((alert) => <div key={alert.id}><StateBadge severity={alert.severity} /><strong>{alert.kind.replaceAll('_', ' ')}</strong><span>{alert.summary}</span></div>)}</section> : null}
      <section className="indoor-current-grid" aria-label="Current indoor readings">
        <Panel title="Living Room environment" eyebrow="ARANET + NEST" severity={sourceSeverity(aranet.sourceState)} freshness={panelFreshness(indoor.rooms[0]?.freshness ?? 'NO_DATA')}>
          <div className="indoor-reading-grid"><Metric label="TEMPERATURE" value={display(thermostat.currentTemperature, 1)} unit="°F" detail={thermostat.currentTemperature.metadata.freshness} /><Metric label="HUMIDITY" value={display(aranet.readings.humidity)} unit="%" detail={aranet.readings.humidity.metadata.freshness} /><Metric label="CO₂" value={display(aranet.readings.co2)} unit="ppm" detail={aranet.readings.co2.metadata.freshness} /><Metric label="PRESSURE" value={display(aranet.readings.pressure)} unit="hPa" detail={aranet.readings.pressure.metadata.freshness} /><Metric label="ARANET BATTERY" value={display(aranet.readings.battery)} unit="%" detail={aranet.readings.battery.metadata.freshness} /></div>
        </Panel>
        <Panel title="Living Room Nest" eyebrow="THERMOSTAT / CLOUD" severity={sourceSeverity(thermostat.sourceState)} freshness={panelFreshness(thermostat.currentTemperature.metadata.freshness)}>
          <div className="device-state-line"><strong>{thermostat.sourceState}</strong><span>{thermostat.hvacMode ?? 'NO DATA'} · {thermostat.heatSetpointF ?? '—'}–{thermostat.coolSetpointF ?? '—'}°F</span></div><ThermostatControls thermostat={thermostat} review={setReview} />
        </Panel>
      </section>
      <section className="indoor-history" aria-labelledby="indoor-history-title">
        <div className="section-heading"><div><span className="panel-eyebrow">PROMETHEUS HISTORY</span><h2 id="indoor-history-title">Environmental trends</h2></div><div className="history-window" role="group" aria-label="History window">{WINDOWS.map((item) => <button type="button" aria-pressed={window === item} onClick={() => setWindow(item)} key={item}>{item}</button>)}</div></div>
        <div className="indoor-graph-grid">{metrics.map((metric) => <HistoryGraph key={metric.alias} series={history[metric.alias]} label={metric.label} thresholds={metric.thresholds} scale={metric.scale} />)}</div>
      </section>
      <section className="purifier-grid" aria-label="Air purifiers">
        {indoor.purifiers.map((purifier) => <Panel key={purifier.alias} title={`${purifier.room === 'living_room' ? 'Living Room' : 'Bedroom'} Coway`} eyebrow="AIRMEGA 250S / CLOUD" severity={sourceSeverity(purifier.sourceState)} freshness={panelFreshness(purifier.readings.pm25.metadata.freshness)}><div className="indoor-reading-grid"><Metric label="PM2.5" value={display(purifier.readings.pm25)} unit="µg/m³" /><Metric label="PM10" value={display(purifier.readings.pm10)} unit="µg/m³" /><Metric label="AQI" value={display(purifier.readings.aqi)} /><Metric label="FILTER" value={display(purifier.readings.filterLife)} unit="%" /></div><div className="device-state-line"><strong>{purifier.sourceState}</strong><span>{purifier.power === null ? 'NO DATA' : purifier.power ? 'ON' : 'OFF'} · {purifier.preset ?? '—'} · speed {purifier.speed ?? '—'}</span></div><PurifierControls purifier={purifier} review={setReview} /></Panel>)}
      </section>
      {indoor.actions.length ? <section className="indoor-action-status" aria-live="polite" aria-label="Recent indoor commands">{indoor.actions.slice(0, 5).map((action) => <div key={action.actionId}><StateBadge severity={action.status === 'SUCCEEDED' ? 'OK' : action.status === 'PENDING' ? 'INFO' : 'CRIT'} label={action.status} /><span>{action.target.replaceAll('_', ' ')}</span>{action.message ? <small>{action.message}</small> : null}</div>)}</section> : null}
      {review ? <ReviewDialog review={review} onClose={() => { setReview(null); setError(null); }} onSubmit={() => void submit()} submitting={submitting} error={error} /> : null}
    </main>
  );
}
