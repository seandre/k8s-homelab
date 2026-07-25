export type HistoryScale = { minSpan: number; hardMin?: number; hardMax?: number; digits?: number };

function niceStep(minimum: number) {
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  const normalized = minimum / magnitude;
  const multiple = [1, 2, 2.5, 4, 5, 10].find((candidate) => candidate >= normalized) ?? 10;
  return multiple * magnitude;
}

export function computeHistoryDomain(values: number[], scale: HistoryScale) {
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const desiredSpan = Math.max(observedMax - observedMin, scale.minSpan);
  const step = niceStep(desiredSpan / 5);
  const span = step * 5;
  const center = (observedMin + observedMax) / 2;
  let min = Math.round((center - span / 2) / step) * step;
  let max = min + span;
  if (observedMin < min) { min = Math.floor(observedMin / step) * step; max = min + span; }
  if (observedMax > max) { max = Math.ceil(observedMax / step) * step; min = max - span; }
  if (scale.hardMin !== undefined && min < scale.hardMin) { min = scale.hardMin; max = min + span; }
  if (scale.hardMax !== undefined && max > scale.hardMax) { max = scale.hardMax; min = max - span; }
  const ticks = Array.from({ length: 6 }, (_, index) => Number((min + index * step).toFixed(8)));
  return { min, max, step, ticks };
}
