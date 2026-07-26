import React from 'react';
import { FreshnessLabel, Metric, Panel } from './components.js';
import type { Weather } from '../shared/contracts.js';
import { fixtureWeather } from '../shared/fixtures.js';

function localTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
}

function weatherIcon(condition: string | null) {
  if (!condition) return '○';
  return condition.toLowerCase().includes('cloud') ? '◒' : '☀';
}

export function WeatherScreen({ weather = fixtureWeather }: { weather?: Weather }) {
  return <main className="dashboard" id="weather">
    <section className="hero-row"><div><span className="panel-eyebrow">LOCAL WEATHER / FIXTURE MODE</span><h1>{weather.location}</h1></div><span className="hero-state">Observed {localTime(weather.conditionsMetadata.observedAt)} PT</span></section>
    <section className="weather-screen-grid">
      <Panel id="weather-conditions" title="Conditions" eyebrow="OPEN-METEO" severity={weather.conditionsMetadata.severity} freshness={weather.conditionsMetadata.freshness}><div className="weather-hero"><span aria-hidden="true">{weatherIcon(weather.condition)}</span><strong>{weather.temperatureFahrenheit === null ? '—' : `${weather.temperatureFahrenheit}°F`}</strong><small>{weather.condition ?? weather.conditionsMetadata.message ?? 'No condition data'}</small></div><div className="metric-grid"><Metric label="SUNRISE" value={localTime(weather.sunrise)} /><Metric label="SUNSET" value={localTime(weather.sunset)} /></div></Panel>
      <Panel id="weather-air-quality" title="Air quality" eyebrow="U.S. AQI / µg/m³" severity={weather.airQualityMetadata.severity} freshness={weather.airQualityMetadata.freshness}><div className="metric-grid"><Metric label="U.S. AQI" value={weather.usAqi ?? '—'} detail="U.S. Air Quality Index" /><Metric label="PM2.5" value={weather.pm25 ?? '—'} unit="µg/m³" /><Metric label="PM10" value={weather.pm10 ?? '—'} unit="µg/m³" /></div><p className="weather-source-note">Outdoor air quality for {weather.location}. Source: {weather.airQualityMetadata.source}. <FreshnessLabel freshness={weather.airQualityMetadata.freshness} />{weather.airQualityMetadata.message ? ` ${weather.airQualityMetadata.message}` : ''}</p></Panel>
    </section>
  </main>;
}
