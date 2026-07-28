import { readFileSync } from 'node:fs';

const html = readFileSync(0, 'utf8');
const datasetMode = process.argv.includes('--dataset');
const allowedClasses = new Set([
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

function decodeHtml(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
      (_, entity) => {
        if (entity.startsWith('#x')) {
          return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        }
        if (entity.startsWith('#')) {
          return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        }
        return named[entity.toLowerCase()] ?? _;
      },
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const races = [...html.matchAll(/<tr class="race-row"[\s\S]*?<\/tr>/g)]
  .map(([row]) => {
    const fields = [...row.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)].map(
      ([, value]) => decodeHtml(value),
    );

    return {
      season: fields[0],
      startDate: fields[1],
      endDate: fields[2],
      category: fields[3],
      tier: fields[4],
      classification: fields[5],
      country: fields[6],
      name: fields[7],
    };
  })
  .filter(
    (race) =>
      race.season === '2026' &&
      race.category === 'Women Elite' &&
      allowedClasses.has(race.classification) &&
      !/mixed relay/i.test(race.name),
  );

if (!datasetMode) {
  process.stdout.write(`${JSON.stringify(races, null, 2)}\n`);
  process.exit(0);
}

const countryCodes = {
  Argentina: 'ARG',
  Australia: 'AUS',
  BI: 'BDI',
  Belgium: 'BEL',
  Benin: 'BEN',
  Bolivia: 'BOL',
  Canada: 'CAN',
  Chile: 'CHI',
  China: 'CHN',
  Colombia: 'COL',
  'Costa Rica': 'CRC',
  Croatia: 'CRO',
  'Czech Republic': 'CZE',
  Denmark: 'DEN',
  Ecuador: 'ECU',
  Egypt: 'EGY',
  'El Salvador': 'ESA',
  Estonia: 'EST',
  France: 'FRA',
  Germany: 'GER',
  'Great Britain': 'GBR',
  Guatemala: 'GUA',
  Italy: 'ITA',
  Japan: 'JPN',
  Luxembourg: 'LUX',
  Namibia: 'NAM',
  Netherlands: 'NED',
  'New Zealand': 'NZL',
  Norway: 'NOR',
  Panama: 'PAN',
  Philippines: 'PHI',
  Poland: 'POL',
  Portugal: 'POR',
  'Saudi Arabia': 'KSA',
  Slovakia: 'SVK',
  Slovenia: 'SLO',
  'South Africa': 'RSA',
  Spain: 'ESP',
  Switzerland: 'SUI',
  Thailand: 'THA',
  Turkey: 'TUR',
  UAE: 'UAE',
  USA: 'USA',
  Uruguay: 'URU',
  Uzbekistan: 'UZB',
  Vietnam: 'VIE',
  Zimbabwe: 'ZIM',
};

const statusOverrides = {
  'gp-yvonne-reynders': {
    scheduleStatus: 'cancelled',
    dateNote: 'The 2026 edition was cancelled.',
  },
  'grand-prix-navoi-ladies': {
    scheduleStatus: 'cancelled',
    dateNote: 'The 2026 edition was cancelled.',
  },
  'surf-coast-classic-women': {
    scheduleStatus: 'cancelled',
    dateNote: 'The 2026 women’s race was cancelled.',
  },
  'tour-de-pologne-women': {
    scheduleStatus: 'rescheduled',
    dateNote: 'Moved from 14–16 August to 24–26 July.',
  },
  'tour-de-romandie-feminin': {
    scheduleStatus: 'postponed',
    dateNote: 'The 2026 edition was postponed to 2027.',
  },
  'women-cycling-pro-costa-de-almeria': {
    scheduleStatus: 'cancelled',
    dateNote: 'The 2026 edition was cancelled.',
  },
};

const organizerUrls = {
  'giro-d-italia-women': 'https://www.giroditaliawomen.it/',
  'itzulia-women': 'https://itzulia-women.eus/',
  'lloyds-tour-of-britain-women':
    'https://www.britishcycling.org.uk/tourofbritain',
  'simac-ladies-tour-of-holland': 'https://tigevents.nl/en/events/tour-of-holland/',
  'tour-de-france-femmes-avec-zwift': 'https://www.letourfemmes.fr/en/',
  'vuelta-internacional-femenina-a-costa-rica': 'https://www.fecoci.net/',
};

const pcsUrls = {
  'giro-d-italia-women':
    'https://www.procyclingstats.com/race/giro-d-italia-women/2026',
  'simac-ladies-tour-of-holland':
    'https://www.procyclingstats.com/race/simac-ladies-tour/2026',
  'tour-cycliste-feminin-international-de-l-ardeche':
    'https://www.procyclingstats.com/race/tour-cycliste-feminin-international-ardeche/2026/overview',
  'tour-de-france-femmes-avec-zwift':
    'https://www.procyclingstats.com/race/tour-de-france-femmes/2026',
  'tour-de-romandie-feminin':
    'https://www.procyclingstats.com/race/tour-de-romandie-feminin/2026/overview',
  'women-cycling-pro-costa-de-almeria':
    'https://www.procyclingstats.com/race/women-cycling-pro-costa-de-almeria/2026/result',
};

const uciUrls = {
  'itzulia-women': 'https://www.uci.org/competition-details/2026/ROA/76927',
  'lloyds-tour-of-britain-women':
    'https://www.uci.org/competition-details/2026/ROA/76941',
  'vuelta-internacional-femenina-a-costa-rica':
    'https://www.uci.org/competition-details/2026/ROA/78444',
};

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function differenceInDays(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

const preferredDuplicates = {
  'elmos-dwars-door-het-hageland': '2026-06-13',
  'national-championships-panama-we-road-race': '2026-04-26',
  'tout-commence-en-finistere-ladies-classic': '2026-09-05',
};

const seenIds = new Set();
const normalizedRaces = races
  .map((race) => {
    const id = slugify(race.name);
    const preferredDate = preferredDuplicates[id];

    return {
      id,
      source: race,
      keep:
        preferredDate === undefined ||
        (race.startDate === preferredDate && !seenIds.has(id)),
    };
  })
  .filter(({ id, keep }) => {
    if (!keep || seenIds.has(id)) {
      return false;
    }
    seenIds.add(id);
    return true;
  })
  .map(({ id, source: race }) => {
    const countryName = race.country === 'BI' ? 'Burundi' : race.country;
    const championshipLevel =
      race.classification === 'WC'
        ? 'world'
        : race.classification === 'CC'
          ? 'continental'
          : race.classification === 'NC'
            ? 'national'
            : 'none';
    const eventType = /(?:\bitt\b|time trial|chrono)/i.test(race.name)
      ? 'individual-time-trial'
      : 'road-race';
    const format = race.classification.startsWith('2.')
      ? 'stage-race'
      : 'one-day';
    const status = statusOverrides[id] ?? {
      scheduleStatus: 'scheduled',
    };

    return {
      id,
      name: race.name,
      startDate: race.startDate,
      endDate: race.endDate,
      countryCode: countryCodes[race.country],
      countryName,
      classification: race.classification,
      format,
      eventType,
      championshipLevel,
      raceDays: differenceInDays(race.startDate, race.endDate),
      ...status,
      ...(organizerUrls[id] ? { organizerUrl: organizerUrls[id] } : {}),
      ...(pcsUrls[id] ? { pcsUrl: pcsUrls[id] } : {}),
      ...(uciUrls[id] ? { uciUrl: uciUrls[id] } : {}),
    };
  });

const dataset = {
  season: 2026,
  reviewedOn: '2026-07-27',
  sources: [
    {
      name: 'UCI 2026 Road International Calendar announcement',
      url: 'https://www.uci.org/pressrelease/the-uci-takes-important-measures-to-protect-rider-safety-and-health-and/4hnxXGTJRFAAUBHKLtGFQc',
      role: 'Primary calendar and schedule-change source',
    },
    {
      name: 'UCI 2026 Women’s WorldTour calendar',
      url: 'https://www.uci.org/pressrelease/the-uci-approves-the-2026-calendars-for-the-uci-womens-worldtour-and-uci/4Eom6DCpjNwy5BeppuLXg3',
      role: 'Primary Women’s WorldTour source',
    },
    {
      name: 'ProCyclingStats 2026 calendar',
      url: 'https://www.procyclingstats.com/races.php?circuit=&class=&filter=Filter&s=&year=2026',
      role: 'Dates, classifications, and cancellation cross-check',
    },
    {
      name: 'ProCyclingiCal 2026 calendar',
      url: 'https://www.procyclingical.com/',
      role: 'Structured Women Elite calendar cross-check',
    },
  ],
  races: [
    ...normalizedRaces,
    {
      id: 'tour-cycliste-feminin-international-de-l-ardeche',
      name: "Tour Cycliste Féminin International de l'Ardèche",
      startDate: '2026-09-11',
      endDate: '2026-09-13',
      countryCode: 'FRA',
      countryName: 'France',
      classification: '2.1',
      format: 'stage-race',
      eventType: 'road-race',
      championshipLevel: 'none',
      raceDays: 3,
      scheduleStatus: 'cancelled',
      dateNote: 'The 2026 edition was cancelled.',
      pcsUrl:
        'https://www.procyclingstats.com/race/tour-cycliste-feminin-international-ardeche/2026/overview',
    },
  ].sort((a, b) => {
    const aDate = a.startDate ?? '9999-12-31';
    const bDate = b.startDate ?? '9999-12-31';
    return aDate.localeCompare(bDate) || a.name.localeCompare(b.name);
  }),
};

process.stdout.write(`${JSON.stringify(dataset, null, 2)}\n`);
