import React, { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Point = { id: string; latitude: number; longitude: number; usAqi: number | null; pm25: number | null; pm10: number | null; category: string; observedAt: string; source: string; siteName?: string };
type Detail = Point & { forecast: { at: string; usAqi: number | null }[] };
type MapData = { modelPoints: Point[]; stations: Point[]; stationStatus: 'CURRENT' | 'UNAVAILABLE' };
const PORTLAND: LatLngExpression = [45.527412, -122.68627];

function color(aqi: number | null) { if (aqi === null) return '#667085'; if (aqi <= 50) return '#00a651'; if (aqi <= 100) return '#f4d03f'; if (aqi <= 150) return '#f39c12'; if (aqi <= 200) return '#e74c3c'; if (aqi <= 300) return '#8e44ad'; return '#7e0023'; }
function when(value: string) { return new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(value)); }

export function AirQualityMap() {
  const element = useRef<HTMLDivElement>(null); const mapRef = useRef<LeafletMap | null>(null); const layers = useRef<LayerGroup | null>(null); const timer = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState('Loading air quality map…'); const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => {
    if (!element.current || mapRef.current) return; let disposed = false;
    void (async () => { const leaflet = await import('leaflet'); if (disposed || !element.current) return; const L = leaflet.default;
    const map = L.map(element.current, { center: PORTLAND, zoom: 9, minZoom: 3, maxZoom: 15, preferCanvas: true }); mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' }).addTo(map);
    layers.current = L.layerGroup().addTo(map);
    const load = async () => {
      const bounds = map.getBounds(); if (bounds.getNorth() - bounds.getSouth() > 8 || bounds.getEast() - bounds.getWest() > 8) { layers.current?.clearLayers(); setStatus('Zoom in to load air quality data.'); return; }
      setStatus('Updating map…');
      try {
        const query = new URLSearchParams({ north: String(bounds.getNorth()), south: String(bounds.getSouth()), east: String(bounds.getEast()), west: String(bounds.getWest()) });
        const response = await fetch(`/api/v1/weather/air-quality-map?${query}`); if (!response.ok) throw new Error(); const payload = await response.json() as { data: MapData };
        layers.current?.clearLayers();
        const radius = Math.max(8000, Math.min(55000, map.getBounds().getNorthEast().distanceTo(map.getBounds().getNorthWest()) / 7));
        for (const point of payload.data.modelPoints) L.circle([point.latitude, point.longitude], { radius, stroke: false, fillColor: color(point.usAqi), fillOpacity: .42, interactive: false }).addTo(layers.current!);
        for (const point of payload.data.stations) L.circleMarker([point.latitude, point.longitude], { radius: 8, color: '#fff', weight: 2, fillColor: color(point.usAqi), fillOpacity: 1 }).bindTooltip(`${point.siteName ?? 'AirNow station'} · AQI ${point.usAqi ?? '—'}`).on('click', () => void select(point.latitude, point.longitude)).addTo(layers.current!);
        setStatus(`${payload.data.modelPoints.length} model samples · ${payload.data.stations.length} AirNow stations${payload.data.stationStatus === 'UNAVAILABLE' ? ' (station data unavailable)' : ''}`);
      } catch { setStatus('Air quality map data is temporarily unavailable.'); }
    };
    const select = async (latitude: number, longitude: number) => { setStatus('Loading location details…'); try { const response = await fetch(`/api/v1/weather/air-quality-point?${new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) })}`); if (!response.ok) throw new Error(); const payload = await response.json() as { data: Detail }; setDetail(payload.data); setStatus('Location details updated.'); } catch { setStatus('Location forecast is temporarily unavailable.'); } };
    let pointerStart: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
    const onPointerUp = (event: PointerEvent) => { const start = pointerStart; pointerStart = null; if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || (event.target as HTMLElement).closest('.leaflet-control')) return; const point = map.mouseEventToLatLng(event); void select(point.lat, point.lng); };
    map.getContainer().addEventListener('pointerdown', onPointerDown, true); map.getContainer().addEventListener('pointerup', onPointerUp, true); map.on('moveend', () => { if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void load(), 450); });
    void load(); })(); return () => { disposed = true; if (timer.current) window.clearTimeout(timer.current); mapRef.current?.remove(); mapRef.current = null; };
  }, []);
  return <section className="air-map-section" aria-labelledby="air-map-title">
    <div className="section-heading"><div><h2 id="air-map-title">Interactive Air Quality Map</h2><span role="status" className="history-update-status">{status}</span></div><button className="map-home-button" type="button" onClick={() => mapRef.current?.setView(PORTLAND, 9)}>Return to 97209</button></div>
    <div className="air-map-layout"><div className="air-map" ref={element} aria-label="Draggable air quality map. Click a location for current values and forecast." />
      <aside className="air-map-detail" aria-live="polite"><h3>{detail ? `${detail.category} · AQI ${detail.usAqi ?? '—'}` : 'Select a location'}</h3>{detail ? <><dl><div><dt>PM2.5</dt><dd>{detail.pm25 ?? '—'} µg/m³</dd></div><div><dt>PM10</dt><dd>{detail.pm10 ?? '—'} µg/m³</dd></div><div><dt>Updated</dt><dd>{when(detail.observedAt)}</dd></div><div><dt>Source</dt><dd>{detail.source}</dd></div></dl><h4>12-hour AQI forecast</h4><div className="air-map-forecast">{detail.forecast.map((point) => <div key={point.at}><span>{when(point.at)}</span><strong style={{ color: color(point.usAqi) }}>{point.usAqi ?? '—'}</strong></div>)}</div></> : <p>Drag the map, then click anywhere to inspect AQI, particulate levels, category, observation time, and forecast.</p>}</aside>
    </div><div className="air-map-legend" aria-label="US EPA AQI color legend">{[['Good', '#00a651'], ['Moderate', '#f4d03f'], ['Sensitive groups', '#f39c12'], ['Unhealthy', '#e74c3c'], ['Very unhealthy', '#8e44ad'], ['Hazardous', '#7e0023']].map(([label, value]) => <span key={label}><i style={{ background: value }} />{label}</span>)}</div>
    <p className="weather-source-note">Heat layer: Open-Meteo/CAMS model data. Markers: AirNow monitoring sites. Basemap: OpenStreetMap. AQI colors follow the U.S. EPA scale.</p>
  </section>;
}
