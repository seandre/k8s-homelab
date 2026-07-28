import { useEffect, useMemo, useState } from 'react';
import datasetJson from './data/races-2026.json';
import {
  CLASSIFICATIONS,
  DEFAULT_STATE,
  filterRaces,
  getFormatLabel,
  getLocalIsoDate,
  getSeasonStats,
  getSpotlightRaces,
  getStatusLabel,
  hasActiveFilters,
  isRaceActive,
  isRaceComplete,
  parseCalendarState,
  serializeCalendarState,
  sortRaces,
} from './calendar';
import type {
  CalendarState,
  Race,
  RaceDataset,
  SortKey,
} from './types';

const dataset = datasetJson as RaceDataset;
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
});
const longDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});
const reviewedFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long' });

const monthOptions = Array.from({ length: 12 }, (_, index) => {
  const value = `${index + 1}`.padStart(2, '0');
  return {
    value,
    label: monthFormatter.format(new Date(2026, index, 15)),
  };
});

function dateFromIso(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatShortDate(date: string) {
  return dateFormatter.format(dateFromIso(date)).toUpperCase();
}

function formatLongDate(date: string) {
  return longDateFormatter.format(dateFromIso(date));
}

function formatDisplayDate(race: Race) {
  if (race.startDate === null || race.endDate === null) {
    return 'DATE TBC';
  }
  if (race.startDate === race.endDate) {
    return formatShortDate(race.startDate);
  }

  const start = dateFromIso(race.startDate);
  const end = dateFromIso(race.endDate);
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();

  if (sameMonth) {
    return `${`${start.getDate()}`.padStart(2, '0')}–${formatShortDate(
      race.endDate,
    )}`;
  }
  return `${formatShortDate(race.startDate)}–${formatShortDate(race.endDate)}`;
}

function getDisplayName(race: Race) {
  return race.name
    .replace(
      /^National Championships (.+) WE - ITT$/,
      '$1 National Championships — Individual Time Trial',
    )
    .replace(
      /^National Championships (.+) WE - Road Race$/,
      '$1 National Championships — Road Race',
    )
    .replace(/\bWE - ITT$/, 'Women Elite — Individual Time Trial')
    .replace(/\bWE - Road Race$/, 'Women Elite — Road Race');
}

function readExpandedRaceId() {
  return decodeURIComponent(window.location.hash.replace(/^#/, ''));
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function StatusTag({
  race,
  today,
}: {
  race: Race;
  today: string;
}) {
  if (isRaceActive(race, today)) {
    return <strong className="status-label is-live">On now</strong>;
  }
  if (race.scheduleStatus !== 'scheduled') {
    return (
      <strong className={`status-label is-${race.scheduleStatus}`}>
        {getStatusLabel(race.scheduleStatus)}
      </strong>
    );
  }
  return null;
}

function RaceDetail({ race }: { race: Race }) {
  const primaryUciSource = dataset.sources.find((source) =>
    source.name.startsWith('UCI 2026 Road'),
  );

  return (
    <div className="race-detail" id={`detail-${race.id}`}>
      <div className="detail-heading">
        <p className="detail-intro">
          {race.dateNote ??
            `${getFormatLabel(race)} on the 2026 Women Elite road calendar.`}
        </p>
        <span>{getStatusLabel(race.scheduleStatus)}</span>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Dates</dt>
          <dd>
            {race.startDate === null || race.endDate === null
              ? 'To be confirmed'
              : race.startDate === race.endDate
                ? formatLongDate(race.startDate)
                : `${formatLongDate(race.startDate)} — ${formatLongDate(
                    race.endDate,
                  )}`}
          </dd>
        </div>
        <div>
          <dt>Race days</dt>
          <dd>{race.raceDays.toString().padStart(2, '0')}</dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>
            {race.countryName} · {race.countryCode}
          </dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>
            {race.championshipLevel === 'none'
              ? race.classification
              : `${race.championshipLevel} championship`}
          </dd>
        </div>
      </dl>
      <div className="detail-actions">
        <div className="detail-links" aria-label="Race links">
          {race.organizerUrl ? (
            <a href={race.organizerUrl} target="_blank" rel="noreferrer">
              Organizer <span aria-hidden="true">↗</span>
            </a>
          ) : null}
          {race.pcsUrl ? (
            <a href={race.pcsUrl} target="_blank" rel="noreferrer">
              PCS <span aria-hidden="true">↗</span>
            </a>
          ) : null}
          {race.uciUrl || primaryUciSource ? (
            <a
              href={race.uciUrl ?? primaryUciSource?.url}
              target="_blank"
              rel="noreferrer"
            >
              UCI {race.uciUrl ? 'event' : 'calendar'}{' '}
              <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
        <span className="detail-note">
          Schedule reviewed{' '}
          {reviewedFormatter
            .format(dateFromIso(dataset.reviewedOn))
            .toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function RaceRow({
  race,
  isExpanded,
  onToggle,
  today,
}: {
  race: Race;
  isExpanded: boolean;
  onToggle: () => void;
  today: string;
}) {
  const complete = isRaceComplete(race, today);
  const active = isRaceActive(race, today);

  return (
    <article
      className={`race-card${complete ? ' is-complete' : ''}${
        active ? ' is-active' : ''
      }${isExpanded ? ' is-expanded' : ''}${
        race.scheduleStatus === 'cancelled' ||
        race.scheduleStatus === 'postponed'
          ? ' is-unavailable'
          : ''
      }`}
    >
      <button
        className="race-row"
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={`detail-${race.id}`}
      >
        <span className="race-date" data-label="Date">
          {formatDisplayDate(race)}
        </span>
        <span className="race-name" data-label="Race">
          <span>{getDisplayName(race)}</span>
          <StatusTag race={race} today={today} />
        </span>
        <span className="race-country" data-label="Country">
          <abbr title={race.countryName}>{race.countryCode}</abbr>
        </span>
        <span className="race-class" data-label="Class">
          {race.classification}
        </span>
        <span className="race-format" data-label="Format">
          {getFormatLabel(race)}
          <span className="row-arrow" aria-hidden="true">
            {isExpanded ? '−' : '+'}
          </span>
        </span>
      </button>
      {isExpanded ? <RaceDetail race={race} /> : null}
    </article>
  );
}

function SortHeading({
  sortKey,
  label,
  state,
  onSort,
}: {
  sortKey: SortKey;
  label: string;
  state: CalendarState;
  onSort: (key: SortKey) => void;
}) {
  const active = state.sort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Sort by ${label}${
        active ? `, currently ${state.direction}ending` : ''
      }`}
    >
      {label}
      <span aria-hidden="true">
        {active ? (state.direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );
}

function RaceList({
  races,
  expandedRaceId,
  setExpandedRaceId,
  today,
}: {
  races: Race[];
  expandedRaceId: string;
  setExpandedRaceId: (id: string) => void;
  today: string;
}) {
  return (
    <div className="race-list">
      {races.map((race) => (
        <div id={`race-${race.id}`} key={race.id}>
          <RaceRow
            race={race}
            today={today}
            isExpanded={expandedRaceId === race.id}
            onToggle={() =>
              setExpandedRaceId(expandedRaceId === race.id ? '' : race.id)
            }
          />
        </div>
      ))}
    </div>
  );
}

function App() {
  const today = getLocalIsoDate();
  const [state, setState] = useState<CalendarState>(() =>
    parseCalendarState(new URLSearchParams(window.location.search)),
  );
  const [expandedRaceId, setExpandedRaceIdState] = useState(readExpandedRaceId);
  const spotlight = getSpotlightRaces(dataset.races, today);
  const stats = getSeasonStats(dataset.races, today);
  const countries = useMemo(
    () =>
      [...new Map(dataset.races.map((race) => [race.countryCode, race])).values()]
        .map((race) => ({
          code: race.countryCode,
          name: race.countryName,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const visibleRaces = useMemo(
    () =>
      sortRaces(
        filterRaces(dataset.races, state),
        state.sort,
        state.direction,
      ),
    [state],
  );
  const datedRaces = visibleRaces.filter((race) => race.startDate !== null);
  const tbcRaces = visibleRaces.filter((race) => race.startDate === null);
  const chronological = state.sort === 'date';
  const chronologicalGroups = useMemo(() => {
    if (!chronological) {
      return [];
    }
    return datedRaces.reduce<Map<string, Race[]>>((months, race) => {
      const month = race.startDate?.slice(0, 7) ?? 'tbc';
      const entries = months.get(month) ?? [];
      entries.push(race);
      months.set(month, entries);
      return months;
    }, new Map());
  }, [chronological, datedRaces]);

  useEffect(() => {
    const params = serializeCalendarState(state);
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${
      window.location.hash
    }`;
    window.history.replaceState(null, '', nextUrl);
  }, [state]);

  useEffect(() => {
    const syncFromUrl = () => {
      setState(parseCalendarState(new URLSearchParams(window.location.search)));
      setExpandedRaceIdState(readExpandedRaceId());
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  function updateState<Key extends keyof CalendarState>(
    key: Key,
    value: CalendarState[Key],
  ) {
    const nextState = { ...state, [key]: value };
    setState(nextState);
    if (
      expandedRaceId &&
      !filterRaces(dataset.races, nextState).some(
        (race) => race.id === expandedRaceId,
      )
    ) {
      setExpandedRaceId('');
    }
  }

  function setExpandedRaceId(id: string) {
    setExpandedRaceIdState(id);
    const nextUrl = `${window.location.pathname}${window.location.search}${
      id ? `#${encodeURIComponent(id)}` : ''
    }`;
    window.history.replaceState(null, '', nextUrl);
  }

  function handleSort(key: SortKey) {
    setState((current) => ({
      ...current,
      sort: key,
      direction:
        current.sort === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function scrollToRace(id: string) {
    setExpandedRaceId(id);
    requestAnimationFrame(() => {
      document
        .getElementById(`race-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  return (
    <main>
      <a className="skip-link" href="#calendar-heading">
        Skip to calendar
      </a>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Women’s Road Calendar">
          WRC<span>26</span>
        </a>
        <p>Women Elite · Road</p>
        <p className="review-state">
          <span aria-hidden="true" />
          Reviewed{' '}
          {formatShortDate(dataset.reviewedOn).replace(' ', '\u00a0')}
        </p>
      </header>

      <section className="masthead" id="top" aria-labelledby="page-title">
        <p className="eyebrow">The 2026 season, from first flag to final line</p>
        <h1 id="page-title">
          <span>Women’s Road</span>
          <span>
            Calendar <em>/ 2026</em>
          </span>
        </h1>
        <div className="masthead-footer">
          <p>WorldTour · ProSeries · Class 1 &amp; 2 · Championships</p>
          <p>All-day venue dates · Day first</p>
        </div>
      </section>

      {spotlight.races.length > 0 ? (
        <section className="now-panel" aria-labelledby="now-heading">
          <div className="now-label">
            <span className="pulse" aria-hidden="true" />
            <p>{spotlight.mode === 'active' ? 'On now' : 'Next up'}</p>
            <span className="edition">
              {spotlight.races.length.toString().padStart(2, '0')}
            </span>
          </div>
          <div className="now-race">
            <p className="section-kicker" id="now-heading">
              {spotlight.mode === 'active'
                ? `${spotlight.races.length} active ${
                    spotlight.races.length === 1 ? 'event' : 'events'
                  }`
                : `Next start · ${formatShortDate(
                    spotlight.races[0]?.startDate ?? today,
                  )}`}
            </p>
            <div className="spotlight-list">
              {spotlight.races.map((race) => (
                <button
                  type="button"
                  key={race.id}
                  onClick={() => scrollToRace(race.id)}
                >
                  <span>
                    {race.countryCode} · {race.classification}
                  </span>
                  <strong>{getDisplayName(race)}</strong>
                  <em aria-hidden="true">↘</em>
                </button>
              ))}
            </div>
          </div>
          <div className="now-action" aria-hidden="true">
            <span>Season</span>
            <strong>2026</strong>
          </div>
        </section>
      ) : null}

      <section className="season-summary" aria-labelledby="summary-heading">
        <div className="summary-title">
          <p className="section-kicker">Full season view</p>
          <h2 id="summary-heading">At a glance</h2>
          <p>
            Cancellations and postponements remain visible but are excluded
            from active season totals.
          </p>
        </div>
        <dl className="stats">
          <div>
            <dt>Events</dt>
            <dd>{stats.events.toString().padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>Race days</dt>
            <dd>{stats.raceDays.toString().padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>Countries</dt>
            <dd>{stats.countries.toString().padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>Complete</dt>
            <dd>{stats.completed.toString().padStart(2, '0')}</dd>
          </div>
          <div className="stat-accent">
            <dt>Remaining</dt>
            <dd>{stats.remaining.toString().padStart(2, '0')}</dd>
          </div>
        </dl>
      </section>

      <section className="calendar" aria-labelledby="calendar-heading">
        <div className="calendar-intro">
          <div>
            <p className="section-kicker">Season / 2026</p>
            <h2 id="calendar-heading">The calendar</h2>
          </div>
          <p>
            Search the full Women Elite road season, refine it by race type, or
            select a column to change the running order.
          </p>
        </div>

        <div className="calendar-tools">
          <label className="search-field">
            <span>Search races</span>
            <div>
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={state.query}
                placeholder="Race, country, class…"
                onChange={(event) => updateState('query', event.target.value)}
              />
            </div>
          </label>
          <div className="filter-grid">
            <FilterSelect
              label="Month"
              value={state.month}
              onChange={(value) => updateState('month', value)}
            >
              <option value="all">All months</option>
              {monthOptions.map((month) => (
                <option value={month.value} key={month.value}>
                  {month.label}
                </option>
              ))}
              <option value="tbc">Date TBC</option>
            </FilterSelect>
            <FilterSelect
              label="Classification"
              value={state.classification}
              onChange={(value) =>
                updateState(
                  'classification',
                  value as CalendarState['classification'],
                )
              }
            >
              <option value="all">All classes</option>
              {CLASSIFICATIONS.map((classification) => (
                <option value={classification} key={classification}>
                  {classification}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Country"
              value={state.country}
              onChange={(value) => updateState('country', value)}
            >
              <option value="all">All countries</option>
              {countries.map((country) => (
                <option value={country.code} key={country.code}>
                  {country.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Format"
              value={state.format}
              onChange={(value) =>
                updateState('format', value as CalendarState['format'])
              }
            >
              <option value="all">All formats</option>
              <option value="one-day">One-day road</option>
              <option value="stage-race">Stage race</option>
              <option value="individual-time-trial">Individual TT</option>
            </FilterSelect>
            <FilterSelect
              label="Championship"
              value={state.championship}
              onChange={(value) =>
                updateState(
                  'championship',
                  value as CalendarState['championship'],
                )
              }
            >
              <option value="all">All levels</option>
              <option value="none">Non-championship</option>
              <option value="world">World</option>
              <option value="continental">Continental</option>
              <option value="national">National</option>
            </FilterSelect>
            <FilterSelect
              label="Schedule"
              value={state.status}
              onChange={(value) =>
                updateState('status', value as CalendarState['status'])
              }
            >
              <option value="all">All statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="postponed">Postponed</option>
              <option value="date-tbc">Date TBC</option>
              <option value="cancelled">Cancelled</option>
            </FilterSelect>
          </div>
          <div className="filter-summary" aria-live="polite">
            <p>
              <strong>{visibleRaces.length}</strong>{' '}
              {visibleRaces.length === 1 ? 'event' : 'events'} shown
            </p>
            {hasActiveFilters(state) ? (
              <button
                type="button"
                onClick={() => {
                  setState({
                    ...DEFAULT_STATE,
                    sort: state.sort,
                    direction: state.direction,
                  });
                  setExpandedRaceId('');
                }}
              >
                Clear filters <span aria-hidden="true">×</span>
              </button>
            ) : (
              <p>All filters clear</p>
            )}
          </div>
        </div>

        <div className="column-headings">
          <SortHeading
            sortKey="date"
            label="Date"
            state={state}
            onSort={handleSort}
          />
          <SortHeading
            sortKey="race"
            label="Race"
            state={state}
            onSort={handleSort}
          />
          <SortHeading
            sortKey="country"
            label="Country"
            state={state}
            onSort={handleSort}
          />
          <SortHeading
            sortKey="class"
            label="Class"
            state={state}
            onSort={handleSort}
          />
          <SortHeading
            sortKey="format"
            label="Format"
            state={state}
            onSort={handleSort}
          />
        </div>

        {visibleRaces.length === 0 ? (
          <div className="empty-state">
            <span>00</span>
            <h3>No races found</h3>
            <p>Try another search or reset the current filters.</p>
            <button
              type="button"
              onClick={() => {
                setState(DEFAULT_STATE);
                setExpandedRaceId('');
              }}
            >
              Clear all filters
            </button>
          </div>
        ) : chronological ? (
          [...chronologicalGroups.entries()].map(([month, races]) => (
            <section className="month" key={month}>
              <div className="month-heading">
                <h3>
                  {monthFormatter.format(dateFromIso(`${month}-15`))}
                </h3>
                <span>
                  {races.length.toString().padStart(2, '0')}{' '}
                  {races.length === 1 ? 'event' : 'events'}
                </span>
              </div>
              <RaceList
                races={races}
                today={today}
                expandedRaceId={expandedRaceId}
                setExpandedRaceId={setExpandedRaceId}
              />
            </section>
          ))
        ) : (
          <section className="month sorted-results">
            <div className="month-heading">
              <h3>Sorted results</h3>
              <span>
                {datedRaces.length.toString().padStart(2, '0')} events
              </span>
            </div>
            <RaceList
              races={datedRaces}
              today={today}
              expandedRaceId={expandedRaceId}
              setExpandedRaceId={setExpandedRaceId}
            />
          </section>
        )}

        {tbcRaces.length > 0 ? (
          <section className="month tbc-section">
            <div className="month-heading">
              <h3>Date TBC</h3>
              <span>
                {tbcRaces.length.toString().padStart(2, '0')}{' '}
                {tbcRaces.length === 1 ? 'event' : 'events'}
              </span>
            </div>
            <RaceList
              races={tbcRaces}
              today={today}
              expandedRaceId={expandedRaceId}
              setExpandedRaceId={setExpandedRaceId}
            />
          </section>
        ) : null}
      </section>

      <footer className="site-footer">
        <div>
          <span>WRC / 26</span>
          <p>A private calendar for the road season.</p>
        </div>
        <div>
          <p>Schedule reviewed</p>
          <p>{formatLongDate(dataset.reviewedOn)}</p>
        </div>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}

export default App;
