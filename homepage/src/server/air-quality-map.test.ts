import { describe, expect, it } from 'vitest';
import { AirQualityMapAdapter, aqiCategory } from './air-quality-map.js';

describe('air quality map adapter', () => {
  it('uses EPA AQI category boundaries', () => {
    expect([50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiCategory)).toEqual(['Good', 'Moderate', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy for sensitive groups', 'Unhealthy', 'Unhealthy', 'Very unhealthy', 'Very unhealthy', 'Hazardous']);
  });

  it('normalizes a bounded model grid without requiring credentials', async () => {
    const fetcher = async () => ({ ok: true, status: 200, json: async () => Array.from({ length: 36 }, (_, index) => ({ latitude: 45 + index / 100, longitude: -123, current: { time: 1_800_000_000, us_aqi: 42, pm2_5: 6.2, pm10: 11 } })) });
    const adapter = new AirQualityMapAdapter(fetcher);
    const result = await adapter.read({ north: 46, south: 45, east: -122, west: -123 });
    expect(result.modelPoints).toHaveLength(36); expect(result.modelPoints[0]).toMatchObject({ usAqi: 42, category: 'Good', source: 'Open-Meteo / CAMS' });
    expect(result.stationStatus).toBe('UNAVAILABLE');
  });
});
