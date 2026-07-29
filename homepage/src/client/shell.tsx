import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Panel, StateBadge } from './components.js';
import { OverviewScreen } from './mockup.js';
import { ComputeScreen } from './compute.js';
import { NetworkScreen } from './network.js';
import { StorageScreen } from './storage-screen.js';
import { KubernetesScreen, OkdScreen } from './kubernetes.js';
import { ServicesScreen } from './services.js';
import { WeatherScreen } from './weather.js';
import { IndoorScreen } from './indoor.js';
import { readDashboardLayout, persistDashboardLayout, type DashboardLayout } from './layout.js';
import { SearchResults } from './search-results.js';
import { nextSearchIndex, searchDashboard, type SearchResult } from './search.js';
import { useBootstrapData } from './data.js';
import { buildOverviewModel } from './overview.js';
import { findRoute, appRoutes, type AppRoute } from './routes.js';
import { persistAppearance, readStoredAppearance, resolveAppearance, type AppearanceMode } from './theme.js';
import { buildGlobalAlertItems } from './global-alerts.js';
import type { Bootstrap } from '../shared/contracts.js';

function useAppearance() {
  const [mode, setMode] = useState<AppearanceMode>(() => readStoredAppearance(window.localStorage));
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setPrefersDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const resolved = resolveAppearance(mode, prefersDark);
  useEffect(() => {
    document.documentElement.dataset.appearance = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
  const update = (next: AppearanceMode) => {
    setMode(next);
    persistAppearance(next, window.localStorage);
  };
  return { mode, update };
}

function usePortlandClock() {
  const format = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
  const [clock, setClock] = useState(format);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(format()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  return clock;
}

function headerWeatherLabel(weather: Bootstrap['weather']) {
  const temperature = weather.temperatureFahrenheit === null ? '—' : `${weather.temperatureFahrenheit}°F`;
  const condition = weather.condition ?? weather.conditionsMetadata.message ?? 'No conditions';
  return { temperature, condition };
}

function PlaceholderView({ route }: { route: AppRoute }) {
  return (
    <main className="dashboard" id={route.eyebrow.toLowerCase().replaceAll(' ', '-')}>
      <section className="hero-row"><div><span className="panel-eyebrow">{route.eyebrow} / FIXTURE MODE</span><h1>{route.label}</h1></div></section>
      <Panel title={`${route.label} view`} eyebrow="ROUTE READY" severity="INFO">
        <div className="placeholder-state"><strong>FIXTURE VIEW PENDING</strong><span>This stable route is ready for its dedicated fixture implementation.</span></div>
      </Panel>
    </main>
  );
}

function NotFoundView() {
  return (
    <main className="dashboard">
      <section className="hero-row"><div><span className="panel-eyebrow">ROUTE</span><h1>Not found</h1></div></section>
      <Panel title="Unknown view" eyebrow="404" severity="INFO"><div className="empty-state">Choose an approved view from the primary navigation.</div></Panel>
    </main>
  );
}

function DashboardShell({ bootstrap }: { bootstrap: Bootstrap }) {
  const appearance = useAppearance();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [layout, setLayout] = useState<DashboardLayout>(() => readDashboardLayout(window.localStorage));
  const searchInput = useRef<HTMLInputElement>(null);
  const alertsMenu = useRef<HTMLDivElement>(null);
  const clock = usePortlandClock();
  const headerWeather = headerWeatherLabel(bootstrap.weather);
  const route = findRoute(pathname);
  const overview = buildOverviewModel(bootstrap);
  const globalAlerts = buildGlobalAlertItems(bootstrap);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((path: string) => {
    const destination = new URL(path, window.location.origin);
    window.history.pushState({}, '', `${destination.pathname}${destination.hash}`);
    setPathname(destination.pathname);
    if (destination.hash) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        document.getElementById(destination.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, []);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(path);
  };
  const searchResults = searchDashboard(search);
  const updateLayout = (next: DashboardLayout) => { setLayout(next); persistDashboardLayout(next, window.localStorage); };
  const selectSearchResult = useCallback((result: SearchResult) => {
    setSearch(''); setSearchOpen(false); setSelectedSearchIndex(0);
    if (result.action === 'help') { setShowHelp(true); return; }
    if (result.external) { window.open(result.href, '_blank', 'noopener,noreferrer'); return; }
    navigateTo(result.href);
  }, [navigateTo]);

  useEffect(() => { setSelectedSearchIndex(0); }, [search]);
  useEffect(() => {
    if (!alertsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!alertsMenu.current?.contains(event.target as Node)) setAlertsOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [alertsOpen]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !typing) { event.preventDefault(); searchInput.current?.focus(); setSearchOpen(true); return; }
      if (event.key === '?' && !typing) { event.preventDefault(); setShowHelp(true); return; }
      if (event.key === 'Escape') { if (showHelp) setShowHelp(false); else if (showLayout) setShowLayout(false); else if (alertsOpen) setAlertsOpen(false); else { setSearch(''); setSearchOpen(false); } return; }
      if (!searchOpen || searchResults.length === 0) return;
      if (event.key === 'ArrowDown' || (!typing && (event.key === 'j' || event.key === 'l'))) { event.preventDefault(); setSelectedSearchIndex((index) => nextSearchIndex(index, searchResults.length, 1)); return; }
      if (event.key === 'ArrowUp' || (!typing && (event.key === 'k' || event.key === 'h'))) { event.preventDefault(); setSelectedSearchIndex((index) => nextSearchIndex(index, searchResults.length, -1)); return; }
      if (/^[1-8]$/.test(event.key)) { const index = Number(event.key) - 1; if (searchResults[index]) { event.preventDefault(); selectSearchResult(searchResults[index]!); } return; }
      if (event.key === 'Enter') { const result = searchResults[selectedSearchIndex]; if (result) { event.preventDefault(); selectSearchResult(result); } }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alertsOpen, searchOpen, searchResults, selectedSearchIndex, selectSearchResult, showHelp, showLayout]);

  return (
    <div className={`app-frame layout-navigation-${layout.navigation} layout-density-${layout.density} layout-overview-${layout.overview}`}>
      <header className="global-header">
        <div className="brand"><span className="brand-mark">◈</span><strong>Homelab</strong><span className="product-switcher">DASHBOARD</span><a href="https://docs.lab.seandre.dev" target="_blank" rel="noreferrer">Docs ↗</a></div>
        <div className="header-status"><div className="global-alert-control" ref={alertsMenu}><button type="button" className="global-alert-button" aria-haspopup="true" aria-expanded={alertsOpen} aria-controls="global-alert-menu" disabled={globalAlerts.length === 0} onClick={() => { setAlertsOpen((open) => !open); setSearchOpen(false); }}><StateBadge severity={overview.globalSeverity} label={`${overview.globalSeverity} · ${globalAlerts.length} alert${globalAlerts.length === 1 ? '' : 's'}`} /></button>{alertsOpen ? <div className="global-alert-menu" id="global-alert-menu" role="region" aria-label="Active alerts"><div className="global-alert-menu-header"><strong>Active alerts</strong><span>{globalAlerts.length}</span></div>{globalAlerts.map((alert) => <a href={alert.href} key={alert.id} onClick={(event) => { navigate(event, alert.href); setAlertsOpen(false); }}><StateBadge severity={alert.severity} /><span><strong>{alert.name}</strong><small>{alert.summary}</small></span></a>)}</div> : null}</div><span className="header-location">PORTLAND · {clock}<span className="header-weather" aria-label={`Portland weather: ${headerWeather.temperature}, ${headerWeather.condition}`}> · {headerWeather.temperature} · <span className="header-weather-condition">{headerWeather.condition}</span></span></span></div>
        <div className="header-actions">
          <div className="search-control"><label className="search-box"><span aria-hidden="true">⌕</span><input ref={searchInput} aria-label="Search local dashboard" placeholder="Search /" value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => setSearch(event.target.value)} /></label>{searchOpen ? <SearchResults results={searchResults} selectedIndex={selectedSearchIndex} onSelect={selectSearchResult} /> : null}</div>
          <label className="appearance-select"><span className="sr-only">Appearance</span><select aria-label="Appearance" value={appearance.mode} onChange={(event) => appearance.update(event.target.value as AppearanceMode)}><option value="auto">AUTO</option><option value="dark">DARK</option><option value="light">LIGHT</option></select></label>
          <button className="layout-button" type="button" aria-label="Customize dashboard layout" onClick={() => setShowLayout(true)}>Layout</button>
          <button className="help-button" type="button" aria-label="Keyboard help" onClick={() => setShowHelp(!showHelp)}>?</button>
        </div>
      </header>
      <nav className="view-nav" aria-label="Primary navigation">
        {appRoutes.map((item) => <a className={item.path === pathname ? 'active' : ''} href={item.path} onClick={(event) => navigate(event, item.path)} key={item.path}>{item.label}</a>)}
      </nav>
      {route?.path === '/' ? <OverviewScreen bootstrap={bootstrap} /> : route?.path === '/compute' ? <ComputeScreen bootstrap={bootstrap} /> : route?.path === '/network' ? <NetworkScreen bootstrap={bootstrap} /> : route?.path === '/storage-backups' ? <StorageScreen bootstrap={bootstrap} /> : route?.path === '/kubernetes' ? <KubernetesScreen bootstrap={bootstrap} /> : route?.path === '/okd' ? <OkdScreen bootstrap={bootstrap} /> : route?.path === '/services' ? <ServicesScreen search={search} bootstrap={bootstrap} /> : route?.path === '/weather' ? <WeatherScreen weather={bootstrap.weather} /> : route?.path === '/indoor' ? <IndoorScreen bootstrap={bootstrap} /> : route ? <PlaceholderView route={route} /> : <NotFoundView />}
      {showHelp ? <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Keyboard help"><div className="help-card"><div className="drawer-header"><h2>Keyboard help</h2><button type="button" onClick={() => setShowHelp(false)}>Close</button></div><dl><dt>/</dt><dd>Focus search</dd><dt>↑ ↓ / h j k l</dt><dd>Move through results</dd><dt>1–8</dt><dd>Open a numbered result</dd><dt>Enter / Shift+Enter</dt><dd>Open selected result</dd><dt>?</dt><dd>Open this help</dd><dt>Esc</dt><dd>Close detail/help/search</dd></dl></div></div> : null}
      {showLayout ? <div className="help-overlay" role="dialog" aria-modal="true" aria-label="Customize dashboard layout"><div className="help-card layout-card"><div className="drawer-header"><h2>Dashboard layout</h2><button type="button" onClick={() => setShowLayout(false)}>Close</button></div><label>Navigation<select value={layout.navigation} onChange={(event) => updateLayout({ ...layout, navigation: event.target.value as DashboardLayout['navigation'] })}><option value="expanded">Expanded</option><option value="compact">Compact</option></select></label><label>Density<select value={layout.density} onChange={(event) => updateLayout({ ...layout, density: event.target.value as DashboardLayout['density'] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label><label>Overview emphasis<select value={layout.overview} onChange={(event) => updateLayout({ ...layout, overview: event.target.value as DashboardLayout['overview'] })}><option value="balanced">Balanced</option><option value="systems-first">Systems first</option></select></label></div></div> : null}
    </div>
  );
}

export function AppShell() {
  const bootstrap = useBootstrapData();
  if (!bootstrap) {
    return <main className="bootstrap-loading" role="status" aria-live="polite"><span className="panel-eyebrow">CONNECTING</span><strong>Loading live telemetry…</strong></main>;
  }
  return <DashboardShell bootstrap={bootstrap} />;
}
