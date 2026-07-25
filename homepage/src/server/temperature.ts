export function celsiusToFahrenheit(value: number) {
  return value * 9 / 5 + 32;
}

export function fahrenheitToCelsius(value: number) {
  return Number(((value - 32) * 5 / 9).toFixed(2));
}

export function nestSetpointToFahrenheit(value: number, sourceUnit: unknown) {
  const fahrenheit = sourceUnit === '°F' ? value : celsiusToFahrenheit(value);
  return Math.round(fahrenheit);
}
