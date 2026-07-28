import type {
  CalendarState,
  Classification,
  Race,
  ScheduleStatus,
  SeasonStats,
  SortDirection,
  SortKey,
} from './types';

export const DEFAULT_STATE: CalendarState = {
  query: '',
  month: 'all',
  classification: 'all',
  country: 'all',
  format: 'all',
  championship: 'all',
  status: 'all',
  sort: 'date',
  direction: 'asc',
};

export const CLASSIFICATIONS: Classification[] = [
  '1.WWT',
  '2.WWT',
  '1.Pro',
  '2.Pro',
  '1.1',
  '2.1',
  '1.2',
  '2.2',
  'WC',
  'CC',
  'NC',
];

export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  'scheduled',
  'rescheduled',
  'postponed',
  'date-tbc',
  'cancelled',
];

export const SORT_KEYS: SortKey[] = [
  'date',
  'race',
  'country',
  'class',
  'format',
];

const classOrder = new Map(CLASSIFICATIONS.map((value, index) => [value, index]));

export function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isRaceRunnable(race: Race) {
  return !['cancelled', 'postponed'].includes(race.scheduleStatus);
}

export function isRaceComplete(race: Race, today: string) {
  return (
    isRaceRunnable(race) &&
    race.endDate !== null &&
    race.endDate < today
  );
}

export function isRaceActive(race: Race, today: string) {
  return (
    isRaceRunnable(race) &&
    race.startDate !== null &&
    race.endDate !== null &&
    race.startDate <= today &&
    race.endDate >= today
  );
}

export function getSpotlightRaces(races: Race[], today: string) {
  const active = races
    .filter((race) => isRaceActive(race, today))
    .sort(compareDates('asc'));

  if (active.length > 0) {
    return { mode: 'active' as const, races: active };
  }

  const future = races
    .filter(
      (race) =>
        isRaceRunnable(race) &&
        race.startDate !== null &&
        race.startDate > today,
    )
    .sort(compareDates('asc'));
  const earliestDate = future[0]?.startDate;

  return {
    mode: 'next' as const,
    races:
      earliestDate === undefined
        ? []
        : future.filter((race) => race.startDate === earliestDate),
  };
}

export function getFormatKey(race: Race) {
  if (race.eventType === 'individual-time-trial') {
    return 'individual-time-trial';
  }
  return race.format;
}

export function getFormatLabel(race: Race) {
  const key = getFormatKey(race);
  if (key === 'individual-time-trial') {
    return 'Individual TT';
  }
  return key === 'stage-race' ? 'Stage race' : 'One-day road';
}

export function getStatusLabel(status: ScheduleStatus) {
  const labels: Record<ScheduleStatus, string> = {
    scheduled: 'Scheduled',
    rescheduled: 'Rescheduled',
    postponed: 'Postponed',
    'date-tbc': 'Date TBC',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

function matchesQuery(race: Race, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    race.name,
    race.countryName,
    race.countryCode,
    race.classification,
    getFormatLabel(race),
    getStatusLabel(race.scheduleStatus),
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}

export function filterRaces(races: Race[], state: CalendarState) {
  return races.filter((race) => {
    const raceMonth = race.startDate?.slice(5, 7) ?? 'tbc';
    return (
      matchesQuery(race, state.query) &&
      (state.month === 'all' || state.month === raceMonth) &&
      (state.classification === 'all' ||
        state.classification === race.classification) &&
      (state.country === 'all' || state.country === race.countryCode) &&
      (state.format === 'all' || state.format === getFormatKey(race)) &&
      (state.championship === 'all' ||
        state.championship === race.championshipLevel) &&
      (state.status === 'all' || state.status === race.scheduleStatus)
    );
  });
}

function compareDates(direction: SortDirection) {
  return (a: Race, b: Race) => {
    if (a.startDate === null && b.startDate === null) {
      return a.name.localeCompare(b.name);
    }
    if (a.startDate === null) {
      return 1;
    }
    if (b.startDate === null) {
      return -1;
    }
    const result =
      a.startDate.localeCompare(b.startDate) ||
      (a.endDate ?? '').localeCompare(b.endDate ?? '') ||
      a.name.localeCompare(b.name);
    return direction === 'asc' ? result : -result;
  };
}

export function sortRaces(
  races: Race[],
  sort: SortKey,
  direction: SortDirection,
) {
  const sign = direction === 'asc' ? 1 : -1;
  const sorted = [...races];

  sorted.sort((a, b) => {
    if (a.startDate === null && b.startDate !== null) {
      return 1;
    }
    if (a.startDate !== null && b.startDate === null) {
      return -1;
    }

    if (sort === 'date') {
      return compareDates(direction)(a, b);
    }

    let result = 0;
    if (sort === 'race') {
      result = a.name.localeCompare(b.name);
    } else if (sort === 'country') {
      result =
        a.countryName.localeCompare(b.countryName) ||
        a.name.localeCompare(b.name);
    } else if (sort === 'class') {
      result =
        (classOrder.get(a.classification) ?? 99) -
          (classOrder.get(b.classification) ?? 99) ||
        a.name.localeCompare(b.name);
    } else if (sort === 'format') {
      result =
        getFormatLabel(a).localeCompare(getFormatLabel(b)) ||
        a.name.localeCompare(b.name);
    }
    return result * sign;
  });

  return sorted;
}

export function getSeasonStats(races: Race[], today: string): SeasonStats {
  const runnable = races.filter(isRaceRunnable);
  const completed = runnable.filter((race) => isRaceComplete(race, today)).length;

  return {
    events: runnable.length,
    raceDays: runnable.reduce((total, race) => total + race.raceDays, 0),
    countries: new Set(runnable.map((race) => race.countryCode)).size,
    completed,
    remaining: runnable.length - completed,
  };
}

const validMonths = new Set([
  'all',
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  'tbc',
]);
const validFormats = new Set([
  'all',
  'one-day',
  'stage-race',
  'individual-time-trial',
]);
const validChampionships = new Set([
  'all',
  'none',
  'world',
  'continental',
  'national',
]);

export function parseCalendarState(params: URLSearchParams): CalendarState {
  const classification = params.get('class');
  const status = params.get('status');
  const sort = params.get('sort');
  const direction = params.get('dir');
  const month = params.get('month');
  const format = params.get('format');
  const championship = params.get('championship');
  const country = params.get('country');

  return {
    query: params.get('q') ?? '',
    month: month && validMonths.has(month) ? month : DEFAULT_STATE.month,
    classification:
      classification &&
      (classification === 'all' ||
        CLASSIFICATIONS.includes(classification as Classification))
        ? (classification as CalendarState['classification'])
        : DEFAULT_STATE.classification,
    country:
      country && (country === 'all' || /^[A-Z]{3}$/.test(country))
        ? country
        : DEFAULT_STATE.country,
    format:
      format && validFormats.has(format)
        ? (format as CalendarState['format'])
        : DEFAULT_STATE.format,
    championship:
      championship && validChampionships.has(championship)
        ? (championship as CalendarState['championship'])
        : DEFAULT_STATE.championship,
    status:
      status &&
      (status === 'all' ||
        SCHEDULE_STATUSES.includes(status as ScheduleStatus))
        ? (status as CalendarState['status'])
        : DEFAULT_STATE.status,
    sort:
      sort && SORT_KEYS.includes(sort as SortKey)
        ? (sort as SortKey)
        : DEFAULT_STATE.sort,
    direction:
      direction === 'asc' || direction === 'desc'
        ? direction
        : DEFAULT_STATE.direction,
  };
}

export function serializeCalendarState(state: CalendarState) {
  const params = new URLSearchParams();
  const entries: Array<[string, string, string]> = [
    ['q', state.query, DEFAULT_STATE.query],
    ['month', state.month, DEFAULT_STATE.month],
    ['class', state.classification, DEFAULT_STATE.classification],
    ['country', state.country, DEFAULT_STATE.country],
    ['format', state.format, DEFAULT_STATE.format],
    ['championship', state.championship, DEFAULT_STATE.championship],
    ['status', state.status, DEFAULT_STATE.status],
    ['sort', state.sort, DEFAULT_STATE.sort],
    ['dir', state.direction, DEFAULT_STATE.direction],
  ];

  for (const [key, value, defaultValue] of entries) {
    if (value !== defaultValue) {
      params.set(key, value);
    }
  }
  return params;
}

export function hasActiveFilters(state: CalendarState) {
  return (
    state.query !== DEFAULT_STATE.query ||
    state.month !== DEFAULT_STATE.month ||
    state.classification !== DEFAULT_STATE.classification ||
    state.country !== DEFAULT_STATE.country ||
    state.format !== DEFAULT_STATE.format ||
    state.championship !== DEFAULT_STATE.championship ||
    state.status !== DEFAULT_STATE.status
  );
}
