import { useEffect, useState } from 'react';
import { BootstrapSchema, type Bootstrap, type IndoorActionStatus, type TimeSeries } from '../shared/contracts.js';

const HISTORY_CACHE_KEY = 'homepage.telemetry.history.v1';
const HISTORY_LIMIT = 104;

export function mergeIndoorActionHistory(current: IndoorActionStatus[], incoming: IndoorActionStatus[]) {
  const merged = new Map(current.map((action) => [action.actionId, action]));
  for (const action of incoming) merged.set(action.actionId, action);
  return [...merged.values()]
    .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt))
    .slice(-100);
}

export function parseBootstrapEvent(payload: string): Bootstrap | null {
  try { return BootstrapSchema.parse(JSON.parse(payload)); } catch { return null; }
}

function readCachedBootstrap(): Bootstrap | null {
  try { return BootstrapSchema.parse(JSON.parse(sessionStorage.getItem(HISTORY_CACHE_KEY) ?? 'null')); } catch { return null; }
}

function persistBootstrap(bootstrap: Bootstrap) {
  try { sessionStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(bootstrap)); } catch { /* Storage is an optional continuity enhancement. */ }
}

function mergeSeries(current: TimeSeries, cached: TimeSeries | undefined): TimeSeries {
  if (!cached) return current;
  const points = new Map(cached.points.map((point) => [point.timestamp, point]));
  for (const point of current.points) points.set(point.timestamp, point);
  return { ...current, points: [...points.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp)).slice(-HISTORY_LIMIT) };
}

export function mergeBootstrapHistory(current: Bootstrap, cached: Bootstrap | null): Bootstrap {
  if (!cached) return current;
  const cachedSeries = new Map(cached.timeSeries.map((series) => [`${series.metric}\u0000${series.window}`, series]));
  return { ...current, timeSeries: current.timeSeries.map((series) => mergeSeries(series, cachedSeries.get(`${series.metric}\u0000${series.window}`))) };
}

export function useBootstrapData(initial: Bootstrap | null = null) {
  const [data, setData] = useState<Bootstrap | null>(initial);
  useEffect(() => {
    let disposed = false;
    let stream: EventSource | undefined;
    const apply = (incoming: Bootstrap) => {
      const merged = mergeBootstrapHistory(incoming, readCachedBootstrap());
      persistBootstrap(merged);
      if (!disposed) setData(merged);
    };
    const load = async () => {
      try {
        const response = await fetch('/api/v1/bootstrap');
        if (!response.ok) return;
        const body: unknown = await response.json();
        const parsed = BootstrapSchema.safeParse((body as { data?: unknown }).data);
        if (parsed.success) apply(parsed.data);
      } catch { /* The neutral loading state remains visible until a live update arrives. */ }
    };
    const connect = () => {
      if (document.hidden || typeof EventSource === 'undefined') return;
      stream = new EventSource('/api/v1/events');
      stream.addEventListener('bootstrap', (event) => {
        const parsed = parseBootstrapEvent((event as MessageEvent<string>).data);
        if (parsed) apply(parsed);
      });
    };
    const onVisibilityChange = () => {
      if (document.hidden) { stream?.close(); stream = undefined; }
      else { void load(); connect(); }
    };
    void load(); connect();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => { disposed = true; stream?.close(); document.removeEventListener('visibilitychange', onVisibilityChange); };
  }, []);
  return data;
}
