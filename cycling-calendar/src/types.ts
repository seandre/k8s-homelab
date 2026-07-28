export type Classification =
  | '1.WWT'
  | '2.WWT'
  | '1.Pro'
  | '2.Pro'
  | '1.1'
  | '2.1'
  | '1.2'
  | '2.2'
  | 'WC'
  | 'CC'
  | 'NC';

export type RaceFormat = 'one-day' | 'stage-race';
export type EventType = 'road-race' | 'individual-time-trial';
export type ChampionshipLevel = 'none' | 'world' | 'continental' | 'national';
export type ScheduleStatus =
  | 'scheduled'
  | 'rescheduled'
  | 'postponed'
  | 'date-tbc'
  | 'cancelled';

export type Race = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  countryCode: string;
  countryName: string;
  classification: Classification;
  format: RaceFormat;
  eventType: EventType;
  championshipLevel: ChampionshipLevel;
  raceDays: number;
  scheduleStatus: ScheduleStatus;
  dateNote?: string;
  organizerUrl?: string;
  pcsUrl?: string;
  uciUrl?: string;
};

export type DatasetSource = {
  name: string;
  url: string;
  role: string;
};

export type RaceDataset = {
  season: number;
  reviewedOn: string;
  sources: DatasetSource[];
  races: Race[];
};

export type SortKey = 'date' | 'race' | 'country' | 'class' | 'format';
export type SortDirection = 'asc' | 'desc';
export type FormatFilter =
  | 'all'
  | 'one-day'
  | 'stage-race'
  | 'individual-time-trial';

export type CalendarState = {
  query: string;
  month: string;
  classification: Classification | 'all';
  country: string;
  format: FormatFilter;
  championship: ChampionshipLevel | 'all';
  status: ScheduleStatus | 'all';
  sort: SortKey;
  direction: SortDirection;
};

export type SeasonStats = {
  events: number;
  raceDays: number;
  countries: number;
  completed: number;
  remaining: number;
};
