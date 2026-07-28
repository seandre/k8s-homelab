import { readFile } from 'node:fs/promises';

const datasetUrl = new URL('../src/data/races-2026.json', import.meta.url);
const dataset = JSON.parse(await readFile(datasetUrl, 'utf8'));
const errors = [];

const classifications = new Set([
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
]);
const formats = new Set(['one-day', 'stage-race']);
const eventTypes = new Set(['road-race', 'individual-time-trial']);
const championshipLevels = new Set([
  'none',
  'world',
  'continental',
  'national',
]);
const scheduleStatuses = new Set([
  'scheduled',
  'rescheduled',
  'postponed',
  'date-tbc',
  'cancelled',
]);

function addError(path, message) {
  errors.push(`${path}: ${message}`);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isHttpsUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

if (dataset.season !== 2026) {
  addError('season', 'must be 2026');
}
if (!isIsoDate(dataset.reviewedOn)) {
  addError('reviewedOn', 'must be a valid ISO date');
}
if (!Array.isArray(dataset.sources) || dataset.sources.length === 0) {
  addError('sources', 'must contain at least one source');
} else {
  dataset.sources.forEach((source, index) => {
    if (!source?.name || !source?.role) {
      addError(`sources[${index}]`, 'name and role are required');
    }
    if (!isHttpsUrl(source?.url)) {
      addError(`sources[${index}].url`, 'must be a valid HTTPS URL');
    }
  });
}

if (!Array.isArray(dataset.races) || dataset.races.length === 0) {
  addError('races', 'must contain at least one race');
} else {
  const ids = new Set();

  dataset.races.forEach((race, index) => {
    const path = `races[${index}]`;
    if (
      typeof race.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(race.id)
    ) {
      addError(`${path}.id`, 'must be a lowercase kebab-case ID');
    } else if (ids.has(race.id)) {
      addError(`${path}.id`, `duplicate ID "${race.id}"`);
    } else {
      ids.add(race.id);
    }

    if (typeof race.name !== 'string' || race.name.trim().length < 3) {
      addError(`${path}.name`, 'must contain at least three characters');
    }
    if (!/^[A-Z]{3}$/.test(race.countryCode ?? '')) {
      addError(`${path}.countryCode`, 'must be a three-letter uppercase code');
    }
    if (typeof race.countryName !== 'string' || !race.countryName.trim()) {
      addError(`${path}.countryName`, 'is required');
    }
    if (!classifications.has(race.classification)) {
      addError(`${path}.classification`, 'is not supported');
    }
    if (!formats.has(race.format)) {
      addError(`${path}.format`, 'is not supported');
    }
    if (!eventTypes.has(race.eventType)) {
      addError(`${path}.eventType`, 'is not supported');
    }
    if (!championshipLevels.has(race.championshipLevel)) {
      addError(`${path}.championshipLevel`, 'is not supported');
    }
    if (!scheduleStatuses.has(race.scheduleStatus)) {
      addError(`${path}.scheduleStatus`, 'is not supported');
    }
    if (!Number.isInteger(race.raceDays) || race.raceDays < 1) {
      addError(`${path}.raceDays`, 'must be a positive integer');
    }

    const hasStart = race.startDate !== null;
    const hasEnd = race.endDate !== null;
    if (hasStart !== hasEnd) {
      addError(path, 'startDate and endDate must both be dated or both be null');
    }
    if (hasStart && !isIsoDate(race.startDate)) {
      addError(`${path}.startDate`, 'must be a valid ISO date');
    }
    if (hasEnd && !isIsoDate(race.endDate)) {
      addError(`${path}.endDate`, 'must be a valid ISO date');
    }
    if (hasStart && hasEnd && race.startDate > race.endDate) {
      addError(path, 'startDate must not be after endDate');
    }
    if (race.scheduleStatus === 'date-tbc' && (hasStart || hasEnd)) {
      addError(path, 'date-tbc races must use null dates');
    }
    if (race.scheduleStatus !== 'date-tbc' && (!hasStart || !hasEnd)) {
      addError(path, 'only date-tbc races may use null dates');
    }
    if (
      ['rescheduled', 'postponed', 'cancelled'].includes(race.scheduleStatus) &&
      !race.dateNote
    ) {
      addError(
        `${path}.dateNote`,
        `${race.scheduleStatus} races require a date note`,
      );
    }

    if (race.classification.startsWith('1.') && race.format !== 'one-day') {
      addError(path, 'Class 1 events must use one-day format');
    }
    if (race.classification.startsWith('2.') && race.format !== 'stage-race') {
      addError(path, 'Class 2 events must use stage-race format');
    }

    const expectedChampionship = {
      WC: 'world',
      CC: 'continental',
      NC: 'national',
    }[race.classification];
    if (
      expectedChampionship &&
      race.championshipLevel !== expectedChampionship
    ) {
      addError(
        path,
        `${race.classification} must use ${expectedChampionship} championship level`,
      );
    }
    if (!expectedChampionship && race.championshipLevel !== 'none') {
      addError(path, 'non-championship classes must use championship level none');
    }

    for (const key of ['organizerUrl', 'pcsUrl', 'uciUrl']) {
      if (race[key] !== undefined && !isHttpsUrl(race[key])) {
        addError(`${path}.${key}`, 'must be a valid HTTPS URL');
      }
    }
  });
}

if (errors.length > 0) {
  console.error(`2026 race dataset validation failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(
  `Validated ${dataset.races.length} races reviewed ${dataset.reviewedOn}.`,
);
