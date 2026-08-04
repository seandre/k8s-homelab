import React, { useEffect, useMemo, useState } from 'react';
import { FreshnessLabel, Metric, Panel } from './components.js';
import { HistoryResponseSchema, type TimeSeries, type Weather } from '../shared/contracts.js';
import { fixtureWeather } from '../shared/fixtures.js';
import { nextHistoryRefreshDelay, type HistoryScale } from './indoor-chart.js';
import { HistoryGraph } from './indoor.js';
import { aqiTone, pm10Tone, pm25Tone } from './weather-status.js';

const WINDOWS = ['1h', '3h', '6h', '24h', '7d', '30d'] as const;
type Window = typeof WINDOWS[number];
type WeatherHistoryMetric = { alias: string; label: string; thresholds: { value: number; tone: 'blue' | 'light-blue' | 'dark-blue' | 'yellow' | 'red' }[]; scale: HistoryScale; secondaryAlias?: string; secondaryLabel?: string };
const HISTORY_METRICS: WeatherHistoryMetric[] = [
  { alias: 'outdoor.us_aqi', label: 'Air quality index', thresholds: [{ value: 51, tone: 'yellow' }, { value: 101, tone: 'red' }], scale: { fixedMin: 0, fixedMax: 350, ticks: [0, 50, 100, 150, 200, 250, 300, 350], digits: 0 } },
  { alias: 'outdoor.pm25', secondaryAlias: 'outdoor.pm10', secondaryLabel: 'PM10', label: 'Particulate matter', thresholds: [{ value: 9.1, tone: 'yellow' }, { value: 35.5, tone: 'red' }], scale: { minSpan: 40, hardMin: 0, digits: 1 } },
  { alias: 'outdoor.temperature', label: 'Temperature', thresholds: [{ value: 32, tone: 'blue' }, { value: 80, tone: 'yellow' }, { value: 95, tone: 'red' }], scale: { minSpan: 30, digits: 0 } },
  { alias: 'outdoor.humidity', label: 'Humidity', thresholds: [{ value: 30, tone: 'light-blue' }, { value: 70, tone: 'yellow' }], scale: { fixedMin: 0, fixedMax: 100, ticks: [0, 20, 40, 60, 80, 100], digits: 0 } },
  { alias: 'outdoor.precipitation', label: 'Precipitation', thresholds: [], scale: { minSpan: 0.1, hardMin: 0, digits: 2 } },
  { alias: 'outdoor.wind_speed', label: 'Wind speed', thresholds: [{ value: 20, tone: 'yellow' as const }, { value: 35, tone: 'red' as const }], scale: { minSpan: 20, hardMin: 0, digits: 0 } },
];

function localTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
}

function weatherIcon(condition: string | null) {
  if (!condition) return '○';
  return condition.toLowerCase().includes('cloud') ? '◒' : '☀';
}

export function WeatherScreen({ weather = fixtureWeather }: { weather?: Weather }) {
  const currentAirQuality = weather.airQualityMetadata.freshness === 'CURRENT';
  const [historyWindow, setHistoryWindow] = useState<Window>('24h');
  const [history, setHistory] = useState<Record<string, TimeSeries>>({});
  const [historyStatus, setHistoryStatus] = useState<'LOADING' | 'CURRENT' | 'STALE'>('LOADING');
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<string | null>(null);
  const historyAliases = useMemo(() => HISTORY_METRICS.flatMap(({ alias, ...metric }) => 'secondaryAlias' in metric ? [alias, metric.secondaryAlias] : [alias]), []);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    setHistory({});
    setHistoryStatus('LOADING');
    const refresh = async () => {
      const updatedAt = new Date().toISOString();
      const responses = await Promise.all(historyAliases.map(async (alias) => {
        try {
          const response = await fetch(`/api/v1/history?${new URLSearchParams({ metric: alias, window: historyWindow })}`);
          if (!response.ok) return null;
          const parsed = HistoryResponseSchema.safeParse(await response.json());
          return parsed.success ? [alias, parsed.data.data] as const : null;
        } catch { return null; }
      }));
      if (!active) return;
      const successful = responses.filter((response) => response !== null);
      if (successful.length) setHistory(Object.fromEntries(successful));
      if (successful.length === historyAliases.length) {
        setHistoryStatus('CURRENT');
        setHistoryUpdatedAt(updatedAt);
      } else {
        setHistoryStatus('STALE');
      }
    };
    const schedule = () => {
      if (!active || document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => { void refresh().finally(schedule); }, nextHistoryRefreshDelay(Date.now()));
    };
    const onVisibilityChange = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (document.visibilityState === 'visible') void refresh().finally(schedule);
    };
    void refresh().finally(schedule);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [historyAliases, historyWindow]);
  return <main className="dashboard" id="weather">
    <section className="hero-row"><div><span className="panel-eyebrow">LOCAL WEATHER / FIXTURE MODE</span><h1>{weather.location}</h1></div><span className="hero-state">Observed {localTime(weather.conditionsMetadata.observedAt)} PT</span></section>
    <section className="weather-screen-grid">
      <Panel id="weather-conditions" title="Conditions" eyebrow="OPEN-METEO" severity={weather.conditionsMetadata.severity} freshness={weather.conditionsMetadata.freshness}><div className="weather-hero"><span aria-hidden="true">{weatherIcon(weather.condition)}</span><strong>{weather.temperatureFahrenheit === null ? '—' : `${weather.temperatureFahrenheit}°F`}</strong><small>{weather.condition ?? weather.conditionsMetadata.message ?? 'No condition data'}</small></div><div className="metric-grid"><Metric label="SUNRISE" value={localTime(weather.sunrise)} /><Metric label="SUNSET" value={localTime(weather.sunset)} /></div></Panel>
      <Panel id="weather-air-quality" title="Air quality" severity={weather.airQualityMetadata.severity} freshness={weather.airQualityMetadata.freshness}><div className="metric-grid"><Metric label="AQI" value={weather.usAqi ?? '—'} detail="Air Quality Index" indicatorTone={currentAirQuality ? aqiTone(weather.usAqi) : undefined} /><Metric label="PM2.5" value={weather.pm25 ?? '—'} unit="µg/m³" indicatorTone={currentAirQuality ? pm25Tone(weather.pm25) : undefined} /><Metric label="PM10" value={weather.pm10 ?? '—'} unit="µg/m³" indicatorTone={currentAirQuality ? pm10Tone(weather.pm10) : undefined} /></div><p className="weather-source-note">Outdoor air quality for {weather.location}. <FreshnessLabel freshness={weather.airQualityMetadata.freshness} />{weather.airQualityMetadata.message ? ` ${weather.airQualityMetadata.message}` : ''}</p></Panel>
    </section>
    <section className="indoor-history weather-history" aria-labelledby="weather-history-title">
      <div className="section-heading"><div><h2 id="weather-history-title">Outdoor Trend History</h2><span className={`history-update-status history-update-${historyStatus.toLowerCase()}`} role="status">{historyStatus === 'LOADING' ? 'Loading history…' : historyStatus === 'STALE' ? `Update failed${historyUpdatedAt ? ' · retaining previous data' : ''}` : `Updated ${localTime(historyUpdatedAt)} PT`} · Data Source: Open-Meteo</span></div><div className="history-window" role="group" aria-label="Outdoor history window">{WINDOWS.map((item) => <button type="button" aria-pressed={historyWindow === item} onClick={() => setHistoryWindow(item)} key={item}>{item}</button>)}</div></div>
      <div className="indoor-graph-grid">{HISTORY_METRICS.map((metric) => <HistoryGraph
        key={metric.alias}
        series={history[metric.alias]}
        label={metric.label}
        thresholds={[...metric.thresholds]}
        scale={metric.scale}
        {...('secondaryAlias' in metric && history[metric.secondaryAlias] ? { secondarySeries: history[metric.secondaryAlias] } : {})}
        {...('secondaryLabel' in metric ? { secondaryLabel: metric.secondaryLabel } : {})}
      />)}</div>
    </section>
  </main>;
}
