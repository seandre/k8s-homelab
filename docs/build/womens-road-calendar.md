# Women’s Road Calendar — Build and Architecture

The Women’s Road Calendar is a standalone static React application for the
2026 Women Elite road season. Its planned private endpoint is
`https://cycling.lab.seandre.dev`. The application is developed through three
owner-review checkpoints and is not built into a container or deployed until
the third checkpoint is approved.

All three checkpoints were approved on 27 July 2026. The approved application
has been production-built; cluster enablement remains gated on the
namespace-local GHCR pull secret and private DNS creation.

## Product scope

The calendar includes UCI Women’s WorldTour, Women’s ProSeries, Class 1, Class
2, world championship, continental championship, and selected national
championship road races and individual time trials. It intentionally excludes
results, start times, broadcast schedules, mixed relays, junior-only and
Under-23-only events, non-road disciplines, calendar export, analytics,
authentication, and public indexing.

Dates are all-day venue dates. The interface uses English copy and day-first
formats such as `27 JUL`. Cancelled, postponed, rescheduled, and undated events
remain visible with explicit labels.

## Design reference

The visual direction is based primarily on the Music Videos editorial
reference: oversized typography, a strict grid, compact metadata, sortable
rows, inline detail expansion, warm monochrome colors, one restrained orange
status accent, and short functional transitions. Archivo Variable is bundled
with the application so rendering does not depend on an external font host.

The layout has three responsive forms:

- desktop uses a five-column editorial race table;
- tablet preserves the grid with compact typography and two-row filter controls;
- mobile converts each race into a labelled stacked record without horizontal
  page scrolling.

## Data ownership and sources

The maintained source of truth is
`cycling-calendar/src/data/races-2026.json`. It is reviewed manually rather than
synchronized at runtime. The dataset records one review date for the whole
season and contains the source list used for that review.

The source order is:

1. [UCI 2026 Road International Calendar announcement](https://www.uci.org/pressrelease/the-uci-takes-important-measures-to-protect-rider-safety-and-health-and/4hnxXGTJRFAAUBHKLtGFQc);
2. individual UCI competition pages and federation or organizer pages;
3. [ProCyclingStats 2026 calendar](https://www.procyclingstats.com/races.php?circuit=&class=&filter=Filter&s=&year=2026);
4. [ProCyclingiCal](https://www.procyclingical.com/) as a structured
   cross-check.

The extraction helper in `cycling-calendar/scripts/` can create a comparison
snapshot from ProCyclingiCal. Its output is review input, not an authorized
automatic replacement for the maintained JSON.

## Dataset contract

The dataset root contains:

| Field | Meaning |
|---|---|
| `season` | Calendar season; fixed to `2026` |
| `reviewedOn` | Dataset-wide ISO review date |
| `sources` | Named HTTPS sources and their review roles |
| `races` | Curated Women Elite road events |

Each race contains a stable kebab-case ID, name, nullable ISO start and end
dates, three-letter country code and country name, classification, format,
event type, championship level, race-day count, and schedule status. A date
note is required for rescheduled, postponed, and cancelled entries.
Organizer, PCS, and UCI URLs are optional.

Supported classifications are `1.WWT`, `2.WWT`, `1.Pro`, `2.Pro`, `1.1`,
`2.1`, `1.2`, `2.2`, `WC`, `CC`, and `NC`. Supported schedule statuses are
`scheduled`, `rescheduled`, `postponed`, `date-tbc`, and `cancelled`.

`npm run validate:data` rejects:

- duplicate or malformed IDs;
- invalid, partial, or reversed date ranges;
- invalid classifications, formats, statuses, and HTTPS URLs;
- Class 1/Class 2 format mismatches;
- world, continental, or national championship-level mismatches;
- undated events without `date-tbc`;
- changed or unavailable events without a date note.

## Application architecture

The Vite application is entirely static:

- `src/App.tsx` owns the page composition and accessible controls;
- `src/calendar.ts` contains pure search, filter, sorting, statistics,
  spotlight, and URL-state functions;
- `src/data/races-2026.json` is imported at build time;
- `src/styles.css` contains the responsive editorial system;
- Vitest and Testing Library cover pure behavior and user interaction.

There is no HTTP API, runtime synchronization, database, secret, analytics
client, or third-party script. Search and filtering run in the browser over the
bundled dataset.

Search, filter, sort, and direction state use URL query parameters. The single
expanded race uses the URL hash. Links can therefore be bookmarked without
creating server-side state.

## Calendar behavior

The default order is January through December, followed by a Date TBC section
when undated events exist. Completed races are muted. An active event is
highlighted as “On now.” If no event is active, “Next up” contains every
non-cancelled, non-postponed race sharing the earliest future start date.

Season totals exclude cancelled and postponed events. Completed and remaining
totals are derived from the local all-day date without timezone conversion.

Date, Race, Country, Class, and Format headings are sortable. Filters cover
month, classification, country, format, championship level, and schedule
status. One race may be expanded at a time. Detail links are shown in
Organizer, PCS, then UCI fallback order.

## Review checkpoints

| Checkpoint | Review surface | Exit condition |
|---|---|---|
| 1 — Visual shell | Local hot-reload preview with representative data | Owner approves typography, color, hierarchy, rows, and responsive direction |
| 2 — Complete data and interaction | Same local preview with maintained 2026 dataset | Owner approves source coverage, search, filters, sorting, URL state, statistics, and details |
| 3 — Responsive and accessibility polish | Local preview plus approved desktop, tablet, and mobile evidence | Owner approves final interaction, keyboard, touch, motion, and responsive behavior |

No production build, image publication, or cluster mutation was authorized by
Checkpoint 1 or 2 approval. Checkpoint 3 was approved on 27 July 2026.

## Security and access

The final image will serve immutable static files through unprivileged Nginx on
port `8080`. The page includes `noindex`, `nofollow`, and `noarchive` metadata.
Nginx will add static security headers.

The Kubernetes namespace is `cycling-calendar`. Ingress accepts
traffic only from Traefik, and the workload will have no runtime egress. The
hostname is private split DNS and must have no public A, AAAA, CNAME, or
Cloudflare proxy route.

The opt-in LAN development server has no authentication. It must be started
only for a trusted review session and stopped immediately afterward.

## Acceptance criteria

The feature is complete when:

- all dataset validation, unit, interaction, accessibility, and responsive
  checks pass;
- desktop, tablet, and mobile snapshots are owner-approved;
- production output is verified from the exact approved revision;
- the container is unprivileged, scanned, and pinned by immutable digest;
- Kustomize renders, Argo CD reports healthy and synced, and the namespace-local
  `ghcr-pull` secret is confirmed;
- LAN and VPN clients resolve the private hostname, complete TLS, receive the
  security headers and `noindex` metadata, and load the calendar;
- a public DNS and reachability check confirms that no public route exists;
- rollback by reverting the immutable image pin is demonstrated.

Operational commands and recovery steps are in the
[Women’s Road Calendar runbook](../operations/womens-road-calendar.md).
