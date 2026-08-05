import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureWeather } from '../shared/fixtures.js';
import { WeatherScreen } from './weather.js';
import { aqiTone, pm10Tone, pm25Tone } from './weather-status.js';

describe('Weather fixture view', () => {
  it('renders Portland conditions, solar times, and concise AQI labels', () => {
    const html = renderToStaticMarkup(<WeatherScreen />);
    expect(html).toContain('Portland, OR 97209');
    expect(html).toContain('68°F');
    expect(html).toContain('SUNRISE');
    expect(html).toContain('AQI');
    expect(html).toContain('Air Quality Index');
    expect(html).toContain('Outdoor air quality for Portland, OR 97209');
    expect(html).toContain('µg/m³');
    expect(html).not.toContain('U.S. AQI');
    expect(html).not.toContain('U.S. Air Quality Index');
    expect(html).not.toContain(fixtureWeather.airQualityMetadata.source);
    expect(html.match(/metric-indicator-green/g)).toHaveLength(3);
    expect(html).toContain('Outdoor Trend History');
    expect(html).toContain('Air quality index');
    expect(html).toContain('Particulate matter');
    expect(html).toContain('Temperature');
    expect(html).toContain('Humidity');
    expect(html).toContain('Precipitation');
    expect(html).toContain('Wind speed');
    expect(html).toContain('Outdoor history window');
    expect(html).toContain('Data Source: Open-Meteo');
    expect(html).toContain('Visual scale · warm ≥80°F · hot ≥95°F');
    expect(html).toContain('Visual scale · humid ≥70% · very humid ≥85%');
    expect(html).toContain('Visual scale · measurable ≥0.01 in · heavier ≥0.10 in');
    expect(html).toContain('Visual scale · blue bars · height indicates speed');
    expect(html.match(/NO DATA ·/g)).toHaveLength(6);
  });

  it('colors outdoor AQI and particulate readings using EPA category breakpoints', () => {
    expect(aqiTone(50)).toBe('green');
    expect(aqiTone(135)).toBe('orange');
    expect(aqiTone(201)).toBe('purple');
    expect(pm25Tone(9)).toBe('green');
    expect(pm25Tone(67.1)).toBe('red');
    expect(pm10Tone(69.6)).toBe('yellow');
    const weather = { ...fixtureWeather, usAqi: 135, pm25: 67.1, pm10: 69.6 };
    const html = renderToStaticMarkup(<WeatherScreen weather={weather} />);
    expect(html).toContain('AQI trend status: orange');
    expect(html).toContain('PM2.5 trend status: red');
    expect(html).toContain('PM10 trend status: yellow');
  });

  it('keeps condition and air-quality failures independent', () => {
    const weather = { ...fixtureWeather, airQualityMetadata: { ...fixtureWeather.airQualityMetadata, freshness: 'NO_DATA' as const, message: 'AQI feed unavailable.' }, usAqi: null, pm25: null, pm10: null };
    const html = renderToStaticMarkup(<WeatherScreen weather={weather} />);
    expect(html).toContain('Partly cloudy');
    expect(html).toContain('NO DATA');
    expect(html).toContain('AQI feed unavailable.');
    expect(html).not.toContain('metric-indicator-');
  });
});
