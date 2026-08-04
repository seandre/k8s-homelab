import React from 'react';
import { FreshnessLabel, Metric, Panel } from './components.js';
import type { Weather } from '../shared/contracts.js';
import { fixtureWeather } from '../shared/fixtures.js';
import { aqiTone, pm10Tone, pm25Tone } from './weather-status.js';

function localTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) : '—';
}

function weatherIcon(condition: string | null) {
  if (!condition) return '○';
  return condition.toLowerCase().includes('cloud') ? '◒' : '☀';
}

export function WeatherScreen({ weather = fixtureWeather }: { weather?: Weather }) {
  const currentAirQuality = weather.airQualityMetadata.freshness === 'CURRENT';
  return <main className="dashboard" id="weather">
    <section className="hero-row"><div><span className="panel-eyebrow">LOCAL WEATHER / FIXTURE MODE</span><h1>{weather.location}</h1></div><span className="hero-state">Observed {localTime(weather.conditionsMetadata.observedAt)} PT</span></section>
    <section className="weather-screen-grid">
      <Panel id="weather-conditions" title="Conditions" eyebrow="OPEN-METEO" severity={weather.conditionsMetadata.severity} freshness={weather.conditionsMetadata.freshness}><div className="weather-hero"><span aria-hidden="true">{weatherIcon(weather.condition)}</span><strong>{weather.temperatureFahrenheit === null ? '—' : `${weather.temperatureFahrenheit}°F`}</strong><small>{weather.condition ?? weather.conditionsMetadata.message ?? 'No condition data'}</small></div><div className="metric-grid"><Metric label="SUNRISE" value={localTime(weather.sunrise)} /><Metric label="SUNSET" value={localTime(weather.sunset)} /></div></Panel>
      <Panel id="weather-air-quality" title="Air quality" severity={weather.airQualityMetadata.severity} freshness={weather.airQualityMetadata.freshness}><div className="metric-grid"><Metric label="AQI" value={weather.usAqi ?? '—'} detail="Air Quality Index" indicatorTone={currentAirQuality ? aqiTone(weather.usAqi) : undefined} /><Metric label="PM2.5" value={weather.pm25 ?? '—'} unit="µg/m³" indicatorTone={currentAirQuality ? pm25Tone(weather.pm25) : undefined} /><Metric label="PM10" value={weather.pm10 ?? '—'} unit="µg/m³" indicatorTone={currentAirQuality ? pm10Tone(weather.pm10) : undefined} /></div><p className="weather-source-note">Outdoor air quality for {weather.location}. <FreshnessLabel freshness={weather.airQualityMetadata.freshness} />{weather.airQualityMetadata.message ? ` ${weather.airQualityMetadata.message}` : ''}</p></Panel>
    </section>
  </main>;
}
