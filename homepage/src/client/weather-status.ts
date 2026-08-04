export type AirQualityTone = 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'maroon';

export function aqiTone(value: number | null): AirQualityTone | undefined {
  if (value === null) return undefined;
  return value <= 50 ? 'green' : value <= 100 ? 'yellow' : value <= 150 ? 'orange' : value <= 200 ? 'red' : value <= 300 ? 'purple' : 'maroon';
}

export function pm25Tone(value: number | null): AirQualityTone | undefined {
  if (value === null) return undefined;
  return value <= 9 ? 'green' : value <= 35.4 ? 'yellow' : value <= 55.4 ? 'orange' : value <= 125.4 ? 'red' : value <= 225.4 ? 'purple' : 'maroon';
}

export function pm10Tone(value: number | null): AirQualityTone | undefined {
  if (value === null) return undefined;
  return value <= 54 ? 'green' : value <= 154 ? 'yellow' : value <= 254 ? 'orange' : value <= 354 ? 'red' : value <= 424 ? 'purple' : 'maroon';
}
