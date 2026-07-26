import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fixtureWeather } from '../shared/fixtures.js';
import { WeatherScreen } from './weather.js';

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
    expect(html).not.toContain('Source:');
    expect(html).not.toContain(fixtureWeather.airQualityMetadata.source);
  });

  it('keeps condition and air-quality failures independent', () => {
    const weather = { ...fixtureWeather, airQualityMetadata: { ...fixtureWeather.airQualityMetadata, freshness: 'NO_DATA' as const, message: 'AQI feed unavailable.' }, usAqi: null, pm25: null, pm10: null };
    const html = renderToStaticMarkup(<WeatherScreen weather={weather} />);
    expect(html).toContain('Partly cloudy');
    expect(html).toContain('NO DATA');
    expect(html).toContain('AQI feed unavailable.');
  });
});
