export type HistoryScale = {
  minSpan?: number;
  hardMin?: number;
  hardMax?: number;
  fixedMin?: number;
  fixedMax?: number;
  ticks?: number[];
  digits?: number;
};

export type ChartPoint = { x: number; y: number };

export function smoothSvgPath(points: ChartPoint[], tension = 0.65) {
  if (points.length === 0) return '';
  const format = (value: number) => Number(value.toFixed(3));
  let path = `M ${format(points[0]!.x)},${format(points[0]!.y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const following = points[index + 2] ?? next;
    const control1 = {
      x: current.x + (next.x - previous.x) * tension / 6,
      y: current.y + (next.y - previous.y) * tension / 6,
    };
    const control2 = {
      x: next.x - (following.x - current.x) * tension / 6,
      y: next.y - (following.y - current.y) * tension / 6,
    };
    path += ` C ${format(control1.x)},${format(control1.y)} ${format(control2.x)},${format(control2.y)} ${format(next.x)},${format(next.y)}`;
  }
  return path;
}

function niceStep(minimum: number) {
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  const normalized = minimum / magnitude;
  const multiple = [1, 2, 2.5, 4, 5, 10].find((candidate) => candidate >= normalized) ?? 10;
  return multiple * magnitude;
}

export function computeHistoryDomain(values: number[], scale: HistoryScale) {
  if (scale.fixedMin !== undefined && scale.fixedMax !== undefined) {
    const ticks = scale.ticks ?? [scale.fixedMin, scale.fixedMax];
    return {
      min: scale.fixedMin,
      max: scale.fixedMax,
      step: ticks.length > 1 ? ticks[1]! - ticks[0]! : scale.fixedMax - scale.fixedMin,
      ticks,
    };
  }
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const desiredSpan = Math.max(observedMax - observedMin, scale.minSpan ?? 1);
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
