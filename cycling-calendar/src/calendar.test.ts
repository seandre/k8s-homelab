import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  filterRaces,
  getSeasonStats,
  getSpotlightRaces,
  parseCalendarState,
  serializeCalendarState,
  sortRaces,
} from './calendar';
import type { CalendarState, Race } from './types';

const races: Race[] = [
  {
    id: 'alpha-tour',
    name: 'Alpha Tour',
    startDate: '2026-07-25',
    endDate: '2026-07-29',
    countryCode: 'FRA',
    countryName: 'France',
    classification: '2.WWT',
    format: 'stage-race',
    eventType: 'road-race',
    championshipLevel: 'none',
    raceDays: 5,
    scheduleStatus: 'scheduled',
  },
  {
    id: 'beta-classic',
    name: 'Beta Classic',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    countryCode: 'BEL',
    countryName: 'Belgium',
    classification: '1.Pro',
    format: 'one-day',
    eventType: 'road-race',
    championshipLevel: 'none',
    raceDays: 1,
    scheduleStatus: 'scheduled',
  },
  {
    id: 'gamma-chrono',
    name: 'Gamma Chrono',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    countryCode: 'CAN',
    countryName: 'Canada',
    classification: '1.1',
    format: 'one-day',
    eventType: 'individual-time-trial',
    championshipLevel: 'none',
    raceDays: 1,
    scheduleStatus: 'rescheduled',
    dateNote: 'Moved by one week.',
  },
  {
    id: 'worlds-road',
    name: 'World Championships — Road Race',
    startDate: '2026-09-26',
    endDate: '2026-09-26',
    countryCode: 'CAN',
    countryName: 'Canada',
    classification: 'WC',
    format: 'one-day',
    eventType: 'road-race',
    championshipLevel: 'world',
    raceDays: 1,
    scheduleStatus: 'scheduled',
  },
  {
    id: 'cancelled-race',
    name: 'Cancelled Race',
    startDate: '2026-03-01',
    endDate: '2026-03-01',
    countryCode: 'ESP',
    countryName: 'Spain',
    classification: '1.2',
    format: 'one-day',
    eventType: 'road-race',
    championshipLevel: 'none',
    raceDays: 1,
    scheduleStatus: 'cancelled',
    dateNote: 'Cancelled.',
  },
];

function state(overrides: Partial<CalendarState>): CalendarState {
  return { ...DEFAULT_STATE, ...overrides };
}

describe('calendar filters', () => {
  it('searches race and country metadata', () => {
    expect(filterRaces(races, state({ query: 'canada' }))).toHaveLength(2);
    expect(filterRaces(races, state({ query: '2.wwt' }))).toEqual([races[0]]);
  });

  it('combines month, class, country, format, championship and status filters', () => {
    expect(filterRaces(races, state({ month: '08' }))).toHaveLength(2);
    expect(
      filterRaces(
        races,
        state({
          country: 'CAN',
          format: 'individual-time-trial',
          status: 'rescheduled',
        }),
      ),
    ).toEqual([races[2]]);
    expect(
      filterRaces(races, state({ championship: 'world' })),
    ).toEqual([races[3]]);
    expect(
      filterRaces(races, state({ classification: '1.2' })),
    ).toEqual([races[4]]);
  });

  it('handles long names and missing dates without truncating search state', () => {
    const edgeRace: Race = {
      ...races[1],
      id: 'exceptionally-long-race',
      name: 'An Exceptionally Long Women’s International Cycling Championship Race Name',
      startDate: null,
      endDate: null,
      scheduleStatus: 'date-tbc',
    };
    expect(
      filterRaces(
        [edgeRace],
        state({ query: 'international cycling', month: 'tbc' }),
      ),
    ).toEqual([edgeRace]);
    expect(sortRaces([edgeRace, races[0]], 'race', 'asc').at(-1)).toEqual(
      edgeRace,
    );
  });
});

describe('calendar sorting', () => {
  it.each([
    ['date', 'alpha-tour'],
    ['race', 'alpha-tour'],
    ['country', 'beta-classic'],
    ['class', 'alpha-tour'],
    ['format', 'gamma-chrono'],
  ] as const)('sorts by %s', (sort, firstId) => {
    expect(sortRaces(races.slice(0, 4), sort, 'asc')[0]?.id).toBe(firstId);
  });

  it('reverses sort direction while keeping undated events last', () => {
    const undated: Race = {
      ...races[1],
      id: 'tbc',
      name: 'TBC Race',
      startDate: null,
      endDate: null,
      scheduleStatus: 'date-tbc',
    };
    const sorted = sortRaces([...races.slice(0, 2), undated], 'date', 'desc');
    expect(sorted[0]?.id).toBe('beta-classic');
    expect(sorted.at(-1)?.id).toBe('tbc');
  });
});

describe('season state', () => {
  it('returns every active race, otherwise all races on the earliest next date', () => {
    expect(getSpotlightRaces(races, '2026-07-27')).toEqual({
      mode: 'active',
      races: [races[0]],
    });

    const next = getSpotlightRaces(races, '2026-07-30');
    expect(next.mode).toBe('next');
    expect(next.races.map((race) => race.id)).toEqual([
      'beta-classic',
      'gamma-chrono',
    ]);
  });

  it('excludes cancelled events from season statistics', () => {
    expect(getSeasonStats(races, '2026-07-30')).toEqual({
      events: 4,
      raceDays: 8,
      countries: 3,
      completed: 1,
      remaining: 3,
    });
  });
});

describe('URL state', () => {
  it('parses valid query state and rejects unsupported values', () => {
    const parsed = parseCalendarState(
      new URLSearchParams(
        'q=tour&month=08&class=2.WWT&country=FRA&format=stage-race&championship=none&status=rescheduled&sort=race&dir=desc',
      ),
    );
    expect(parsed).toMatchObject({
      query: 'tour',
      month: '08',
      classification: '2.WWT',
      country: 'FRA',
      format: 'stage-race',
      championship: 'none',
      status: 'rescheduled',
      sort: 'race',
      direction: 'desc',
    });
    expect(
      parseCalendarState(new URLSearchParams('class=banana&sort=nope')),
    ).toEqual(DEFAULT_STATE);
  });

  it('omits defaults and round-trips non-default state', () => {
    expect(serializeCalendarState(DEFAULT_STATE).toString()).toBe('');
    const custom = state({
      query: 'roubaix',
      country: 'FRA',
      sort: 'country',
      direction: 'desc',
    });
    expect(
      parseCalendarState(serializeCalendarState(custom)),
    ).toEqual(custom);
  });
});
