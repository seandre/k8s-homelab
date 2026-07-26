# AirGradient ONE Integration Build Plan

## Purpose and authority

This document is the controlling implementation plan for adding one AirGradient
ONE to the Living Room indoor dashboard. It contains the decisions, interfaces,
package boundaries, gates, tests, rollout, and rollback rules needed by an
implementation agent. Agents must not depend on the conversation that produced
this plan.

The integration extends the existing indoor architecture in
[`docs/overview/indoor-dashboard-baseline.md`](../overview/indoor-dashboard-baseline.md).
AG-001 amends that baseline before runtime work begins. Until that amendment is
merged, this document wins for AirGradient-specific scope and the existing
baseline continues to control everything else.

Implementation uses the official Home Assistant AirGradient integration over
local HTTP. The device must run firmware 3.1.1 or newer. Home Assistant normally
polls it approximately once per minute. The ONE resides in the Living Room on
the IoT VLAN and cloud sharing is disabled.

No environmental reading may automatically operate equipment.

## Fixed product decisions

- The canonical device alias is `airgradient_living_room`.
- AirGradient is the primary source for Living Room CO2, humidity, PM2.5, PM10,
  TVOC index, and NOx index.
- Nest remains authoritative for Living Room temperature.
- Aranet remains visible as a comparison and fallback source.
- Living Room PM2.5 alert evaluation uses the worst current value from
  AirGradient and the Living Room Coway.
- Bedroom Coway alerts remain independent.
- TVOC and NOx are informational and never generate alerts.
- Dashboard controls include display brightness, LED brightness, display
  temperature unit, PM standard, and LED mode.
- Every control requires review, confirmation, expected-state version,
  idempotency, convergence, rate limits, and redacted auditing.
- Calibration, firmware, cloud sharing, configuration authority, and arbitrary
  Home Assistant actions are excluded from Homepage controls.
- Production may cut over immediately after live acceptance checks. A multi-day
  soak is not required.

## Agent execution contract

Before changing a package, an agent must:

1. Confirm every dependency and owner gate for that package is complete.
2. Inspect the worktree and preserve unrelated changes.
3. Work on no more than the package's one subsystem-sized change.
4. Keep credentials and private identifiers out of Git, browser payloads,
   fixtures, logs, screenshots, and command output.
5. Never print Kubernetes Secret data.
6. Add deterministic tests for changed behavior and run the package's exact
   checks plus affected cheap checks.
7. Stop at an unmet owner gate instead of inventing evidence.
8. Update only the active package's status and evidence. An agent must not
   silently mark another package complete.

Never commit MAC addresses, serial numbers, raw Home Assistant entity IDs,
tokens, vendor identifiers, or unredacted capability evidence. Private runtime
mappings belong in Home Assistant or Kubernetes Secrets, not Git.

Every package handoff must contain:

- objective, prerequisites, fixed interfaces, and explicit exclusions;
- changed files and commits;
- exact tests and results;
- redacted live evidence, or the words `fixture only`;
- unresolved observations and owner gates;
- rollback instructions; and
- the next unblocked package.

## Target architecture

```text
AirGradient ONE --local HTTP--> Home Assistant on k3s
                                      |
                         allowlisted state and controls
                                      |
              Prometheus history <-- Homepage backend
                                      |
                         schema-v4 REST and SSE
                                      |
                              /indoor browser
```

Home Assistant remains the sole indoor-device configuration and control
authority. The browser never contacts the ONE or Home Assistant directly.
Homepage maps only fixed public aliases to private Home Assistant entities and
services. Prometheus provides history but is never a substitute for current
state.

## Public contract changes

AG-006 replaces strict bootstrap schema v3 with strict schema v4. Schema-v3
clients must reject v4 rather than partially interpreting it. All contract
objects reject unknown fields and identifiers.

Add device alias:

```text
airgradient_living_room
```

Add normalized source:

```text
AIRGRADIENT_LOCAL
```

Add these exact read aliases:

```text
airgradient_living_room.temperature
airgradient_living_room.humidity
airgradient_living_room.co2
airgradient_living_room.pm25
airgradient_living_room.pm10
airgradient_living_room.tvoc_index
airgradient_living_room.nox_index
```

Add these exact control aliases:

```text
airgradient_living_room.display_brightness
airgradient_living_room.led_brightness
airgradient_living_room.display_temperature_unit
airgradient_living_room.pm_standard
airgradient_living_room.led_mode
```

Display and LED brightness advertise numeric capabilities with integer minimum
0, maximum 100, and step 1. Temperature unit, PM standard, and LED mode
advertise their currently available normalized options at runtime. Options must
not be guessed from vendor documentation or fixtures.

No endpoint is added. Existing history endpoints accept the seven exact read
aliases, and `POST /api/v1/indoor/actions` gains five fixed discriminated
commands:

| Command | Target alias | Capability |
|---|---|---|
| Set display brightness | `.display_brightness` | integer 0–100, step 1 |
| Set LED brightness | `.led_brightness` | integer 0–100, step 1 |
| Set display temperature unit | `.display_temperature_unit` | advertised option |
| Set PM standard | `.pm_standard` | advertised option |
| Set LED mode | `.led_mode` | advertised option |

Every action envelope retains the existing origin and network restrictions and
must include a server-generated action ID, expected state version, and one
allowed discriminated command. The server maps it to a fixed Home Assistant
service call, waits for observed convergence, and records a redacted audit
event. It rejects replays, stale state, unavailable sources, invalid
capabilities, arbitrary targets, arbitrary services, and extra fields.

## Reading, freshness, and precedence rules

All seven readings use the existing indoor metadata model: observation time,
freshness, source state, severity, and normalized source. A current value must
have a successful observation inside the AirGradient freshness window selected
in AG-001 from verified polling behavior. A stale or unavailable reading never
becomes a fabricated zero and is never treated as current.

Living Room display and alert precedence is:

| Signal | Primary/authority | Comparison or fallback |
|---|---|---|
| Temperature | Nest | Aranet; AirGradient remains available as a device reading but does not replace Nest authority |
| Humidity | AirGradient | Aranet fallback |
| CO2 | AirGradient | Aranet fallback |
| PM2.5 display | AirGradient | Living Room Coway comparison |
| PM2.5 alert | Maximum of current AirGradient and current Living Room Coway values | Evaluate the one current source if only one is current; pause numeric evaluation if neither is current |
| PM10 | AirGradient | Living Room Coway comparison |
| TVOC index | AirGradient | None; informational |
| NOx index | AirGradient | None; informational |

Fallback never presents a stale value as current. Source-loss incidents remain
separate from numeric incidents. Bedroom Coway PM2.5 evaluation is unchanged
and independent.

## Alert safety

AG-004 preserves the existing thresholds, duration, hysteresis, incident
deduplication, escalation, and recovery behavior unless AG-001 records an
explicit baseline amendment. It changes only authority and source composition:

- Living Room CO2 and humidity use current AirGradient values, falling back to
  current Aranet values when AirGradient is not current.
- Living Room PM2.5 uses the maximum current value from AirGradient and the
  Living Room Coway.
- AirGradient has its own source-unavailable incident.
- TVOC index and NOx index never create threshold alerts.
- A warning incident sends one warning, at most one critical escalation, and
  one recovery. Repeated samples do not notify.
- Missing readings pause their numeric evaluation and cannot lower or recover
  an incident.

Notifications may only open `/indoor`; they cannot operate a device.

## Dashboard contract

The main sensor card becomes **AirGradient + Nest** and shows:

- Nest temperature;
- AirGradient humidity, CO2, PM2.5, PM10, TVOC index, and NOx index;
- AirGradient local-source state and freshness; and
- only settings advertised by current capabilities.

The secondary compact Aranet card shows temperature, humidity, pressure, CO2,
battery, and source health. Partial source failure must leave independent
readings usable and label stale, unavailable, or missing data truthfully.

Graphs appear in this exact order:

1. AirGradient CO2, fixed 400–1400 ppm.
2. AirGradient PM2.5, smoothed, with yellow at 5 and red at 15 µg/m³.
3. Nest temperature, fixed 60–80°F.
4. AirGradient humidity, fixed 0–100%.
5. AirGradient TVOC index, fixed 0–500.
6. AirGradient NOx index, fixed 0–500.

Existing live refresh, custom time ranges, hover line, responsive behavior, and
non-optimistic action state remain unchanged. Settings are keyboard operable,
visibly focused, and reviewed in a confirmation dialog before submission. The
UI reports pending, success, timeout, rejection, and partial-state outcomes
without implying a change before observed convergence.

## Work sequence and package ownership

The model names express the required reasoning tier for assignment:

- **Sol Low:** documentation, indexing, and mechanical verification.
- **Sol High:** bounded manifests, allowlists, and conventional tests.
- **Luna Low:** cross-component implementation with fixed contracts.
- **Luna High:** architecture, alert safety, public schemas, controls, and
  production rollout.

AG-004 and AG-005 may run in parallel after AG-003. Every other dependency is
sequential.

| Package | Model | Depends on | Bounded responsibility |
|---|---|---|---|
| AG-000 Documentation publication | **Sol Low** | None | Publish this controlling plan, link it in site navigation/order, validate links, and commit only documentation. |
| AG-001 Contract baseline | **Luna High** | AG-000 | Amend inventory, aliases, source policy, schema-v4 design, alert authority, control allowlist, status table, acceptance criteria, and rollback contract. No runtime code. |
| AG-002 Network and HA onboarding | **Luna Low** | AG-001 and owner gate | Reserve the IoT address, add minimum HA/k3s-to-device HTTP policy, onboard the official integration, set local configuration, disable cloud sharing, and record redacted capability evidence. |
| AG-003 HA normalization | **Luna Low** | AG-002 | Add canonical template entities, private runtime mappings, Fahrenheit normalization, freshness handling, source rollups, and a device contract test. |
| AG-004 Alert migration | **Luna High** | AG-003 | Move CO2/humidity authority, add worst-current Living Room PM2.5 logic, add AirGradient source-loss incidents, preserve deduplication/hysteresis, and run deterministic synthetic tests. |
| AG-005 Prometheus history | **Sol High** | AG-003 | Extend exact exporter and scrape allowlists, recording/query catalog, history aliases, manifest tests, and redaction checks for seven readings. |
| AG-006 Schema-v4 read path | **Luna High** | AG-003 and AG-005 | Implement schema v4, AirGradient normalized state/capabilities, room precedence, fixtures, HA adapter logic, history validation, compatibility rejection, and API tests. |
| AG-007 Control gateway | **Luna High** | AG-002 and AG-006 | Add five discriminated commands, numeric/option capabilities, fixed HA service mapping, convergence checks, replay protection, audits, and security tests. |
| AG-008 Dashboard UI | **Luna Low** | AG-006 and AG-007 | Build both sensor cards, six graphs, settings UI, review dialogs, partial-state handling, and accessibility/E2E tests. |
| AG-009 Production rollout | **Luna High** | AG-004 and AG-008 | Run the outage/control matrix, build and scan images, deploy through Argo CD, digest-pin, validate live data and controls, update evidence/status documentation, and prove rollback. |

### AG-000 — Documentation publication

**Objective:** Make this plan discoverable and sufficient for later agents.

**Prerequisites:** None.

**Fixed interfaces:** The filename is
`docs/build/airgradient-one-integration.md`; site navigation and documentation
order link to it.

**Work:** Publish only this plan and its index/sidebar links. Run the
documentation build, a link check, and whitespace validation. Commit only the
documentation files changed by this package.

**Exclusions:** No baseline amendments, runtime code, manifests, network
changes, Home Assistant changes, or live device work.

**Acceptance:** The site build resolves all internal links, the plan appears in
navigation/order, unrelated worktree changes remain untouched, and the package
commit contains documentation only.

**Rollback:** Revert the AG-000 documentation commit.

**Next:** AG-001.

### AG-001 — Contract baseline

**Objective:** Amend the controlling indoor contract before implementation.

**Prerequisites:** AG-000.

**Fixed interfaces:** Add the aliases, source, precedence, action commands,
capability shapes, strict schema-v4 design, alert rules, package status table,
acceptance criteria, and rollback contract specified here.

**Work:** Update `docs/overview/indoor-dashboard-baseline.md` only as needed for
the complete AirGradient design. Define how v3 clients reject v4, exact strict
schema shapes, AirGradient freshness, unavailable behavior, worst-current
PM2.5, option normalization, and the five-action allowlist. Add AG-001 through
AG-009 status rows without completing later packages.

**Exclusions:** Runtime code, live onboarding, entity mappings, network policy,
and deployment.

**Acceptance:** The amended baseline has no ambiguous public identifier,
authority, alert, capability, or rollback behavior and its status table agrees
with this dependency graph.

**Rollback:** Revert the baseline amendment; no runtime behavior exists yet.

**Next:** AG-002 after the owner gate.

### AG-002 — Network and Home Assistant onboarding

**Objective:** Establish a private, least-privilege local path from Home
Assistant to the physical ONE and record its actual capabilities.

**Prerequisites:** AG-001 and the owner gate below.

**Owner gate:** The owner must:

1. Place and power the ONE in the Living Room.
2. Connect it to the IoT Wi-Fi.
3. Upgrade it to firmware 3.1.1 or newer.
4. Provide its MAC only to UniFi for address reservation.
5. Confirm Home Assistant may take local configuration authority.

The MAC is entered only in UniFi and is never recorded in Git or the handoff.

**Fixed interfaces:** The canonical alias and local-HTTP-only design are fixed.
Only Home Assistant/k3s receives the minimum required TCP access to the reserved
IoT address. Manual integration by reserved address is allowed when mDNS does
not cross VLANs.

**Work:** Reserve the address, create the narrow policy, onboard the official
integration, select local configuration authority, disable cloud sharing, and
capture redacted firmware, polling, entities, service mappings, numeric ranges,
and option capability evidence.

**Exclusions:** Homepage runtime, public schemas, alerts, dashboards,
calibration, firmware control, cloud-sharing control, and broad Servers-to-IoT
access.

**Live acceptance:**

- Local readings update approximately once per minute.
- Operation continues while device Internet access is blocked.
- Device reboot and Home Assistant restart recover without manual repair.
- Loss and staleness produce unavailable/stale state without fabricated current
  values.
- No unrelated Servers-to-IoT reachability is introduced.
- All five settings can be observed and their actual Home Assistant interfaces
  are recorded without identifiers that Git forbids.

**Rollback:** Remove the integration entry and narrow firewall/address changes,
restore the previous device configuration authority if the owner requests it,
and verify unrelated IoT policy is unchanged.

**Next:** AG-003.

**AG-002 handoff evidence (2026-07-26):** Owner gate complete. The ONE is on
the IoT Wi-Fi with a reserved address, firmware **3.6.2**, the official
Home Assistant integration, local configuration authority, and cloud metric
sharing disabled. UniFi permits only the three k3s node sources to reach the
reserved address on TCP/80; the Home Assistant pod reached the device over
HTTP, while unrelated source/port probes remained blocked. The repository
NetworkPolicy and manifest contract test are committed and pushed in
`9b1e147`; `home-assistant/k3s/test-manifests.sh` passed. No MAC, serial,
token, raw entity ID, or vendor identifier is recorded here.

The approximately-one-minute polling, Internet-loss, device-reboot,
Home-Assistant-restart, stale-state, and five-control convergence checks remain
production acceptance checks for AG-009; AG-003 may use the live integration
and this redacted capability evidence as its input.

### AG-003 — Home Assistant normalization

**Objective:** Expose stable canonical AirGradient state inside Home Assistant.

**Prerequisites:** AG-002.

**Fixed interfaces:** Use only the public aliases and source defined here.
Private raw entity mappings remain server-side. Normalize temperature to
Fahrenheit while preserving Nest as display authority.

**Work:** Add canonical template entities or equivalent normalization, private
mapping helpers, observation/freshness handling, unavailable/null behavior,
and AirGradient source-state rollups. Add a device contract test against
redacted AG-002 capability evidence.

**Exclusions:** Alert authority changes, Prometheus history, schema v4,
Homepage actions, and UI.

**Acceptance:** Tests cover current, stale, unavailable, malformed, Celsius
conversion, recovery, and absence of fabricated numeric values. Configuration
validation passes and raw identifiers do not enter Git or rendered public data.

**Rollback:** Revert normalization configuration and private mappings while
leaving the official integration available for direct Home Assistant use.

**Next:** AG-004 and AG-005, which may proceed in parallel.

**AG-003 handoff evidence (2026-07-26):** COMPLETE. Seven private runtime
mappings feed eight canonical entities: the seven readings and the local-source
rollup. Live state reported all seven mappings populated, all eight canonical
entities current, source `CURRENT`, and temperature normalized to Fahrenheit.
The mappings survived two controlled Home Assistant restarts. Every reading
suppresses unavailable, malformed, or older-than-180-second input and reports
`CURRENT`, `STALE`, or `UNAVAILABLE` freshness without retaining a fabricated
current number. `home-assistant/airgradient/test-contract.sh`,
`home-assistant/k3s/test-manifests.sh`, Kustomize rendering, startup-log review,
Argo health, and the live redacted state check passed.

Changed commits are `780e307`, `5e394af`, `65ff4cd`, and `c3588ac`. Evidence is
live and redacted; no raw entity ID, hardware identifier, or token is recorded.
One operational observation remains: Argo reported the intended revision before
the ConfigMap volume refreshed, so the Git-owned ConfigMap was applied directly
once and Home Assistant restarted; final live content and state matched Git.
Rollback is to revert those commits, let Argo reconcile, remove only the seven
private mappings, and restart Home Assistant. AG-004 and AG-005 are now
unblocked.

### AG-004 — Alert migration

**Objective:** Safely move Living Room environmental alert authority.

**Prerequisites:** AG-003.

**Fixed interfaces:** AirGradient is primary for CO2/humidity; PM2.5 is the
maximum of current AirGradient and Living Room Coway values; Bedroom Coway stays
independent; TVOC/NOx do not alert.

**Work:** Update the alert evaluator and rendered Home Assistant automation
artifacts, add the AirGradient source-loss incident, retain the baseline
thresholds and hysteresis, and add deterministic synthetic event sequences.

**Exclusions:** History, schema/UI work, equipment operation, and unrelated
alert thresholds.

**Acceptance:** Each synthetic incident produces exactly one warning, one
escalation, and one recovery. Tests cover either-source-only PM2.5, both
sources, stale high values, total source loss, fallback precedence, recovery,
restart persistence, and Bedroom independence.

**Rollback:** Revert to the prior Aranet/Coway alert authority and rendered
automation configuration, then reload automations and verify incident state.

**Next:** AG-006 waits for AG-005 as well.

**AG-004 handoff evidence (2026-07-26):** COMPLETE in `8d5bf26`. Live
Home Assistant rollups selected `AIRGRADIENT_LOCAL` for Living Room CO2 and
humidity and `WORST_CURRENT` for Living Room PM2.5. The generated automations
retain the existing warning/critical/recovery durations and deduplication,
add the 180-second AirGradient source-loss incident, preserve Bedroom Coway
independence, and never operate equipment. Deterministic incident, precedence,
either-source PM2.5, total-loss, safety, manifest, generated-artifact, startup,
restart, and redaction checks passed. Rollback is to revert `8d5bf26`, reconcile
the alert ConfigMap, restart Home Assistant, and verify prior incident state.

### AG-005 — Prometheus history

**Objective:** Add bounded history for all seven AirGradient readings.

**Prerequisites:** AG-003.

**Fixed interfaces:** Only the seven exact read aliases and existing supported
history windows are accepted.

**Work:** Extend exporter and scrape allowlists, recording/query catalog,
history aliases, manifests, and redaction tests. Preserve metric labels as
canonical aliases; do not expose raw Home Assistant or vendor identifiers.

**Exclusions:** Arbitrary entity queries, current-state authority, alerts,
schema v4, actions, and UI.

**Acceptance:** Manifest tests pass; every AirGradient alias works for every
supported window including custom ranges; arbitrary aliases are rejected;
missing Prometheus data does not fabricate current state; and scrape/query/log
outputs pass redaction checks.

**Rollback:** Revert the allowlist, recording/query, and manifest changes;
remove only AirGradient series if cleanup is intentionally required.

**Next:** AG-006 after AG-003 and AG-005.

**AG-005 handoff evidence (2026-07-26):** COMPLETE in `952a3ec` with the live
PM2.5 slug correction in `da6a2c0`. The exporter, scrape allowlist, server-side
query catalog, and bounded history adapter accept exactly the seven AirGradient
read aliases for `1h`, `3h`, `6h`, `24h`, `7d`, `30d`, and bounded custom
ranges. Homepage passed 132 tests and typecheck; IE-010 and IE-004 manifest
contracts and redaction checks passed. Live Prometheus reported exactly seven
AirGradient metric names after reconciliation, including Fahrenheit temperature
and PM2.5; arbitrary aliases and source-state history remain excluded. Rollback
is to revert `da6a2c0` and `952a3ec`, reconcile the four scoped resources, and
verify the prior 15-series catalog remains available.

### AG-006 — Schema-v4 read path

**Objective:** Serve strict schema-v4 AirGradient state and history.

**Prerequisites:** AG-003 and AG-005.

**Fixed interfaces:** The public aliases, source, capability forms, room
precedence, existing endpoints, and strict-v4 boundary in this plan.

**Work:** Implement shared contracts, fixtures, normalized AirGradient device
state and capabilities, bootstrap composition, Home Assistant adapter logic,
history validation, and API tests. Bump the bootstrap literal from 3 to 4.

**Exclusions:** Action execution and UI.

**Acceptance:** Contract/adapter/API tests cover current, stale, unavailable,
malformed, Celsius conversion, fallback precedence, worst-current PM2.5,
capability omission, every history window, unknown fields/aliases, and explicit
v3/v4 incompatibility. No v3 client can silently interpret v4 data.

**Rollback:** Revert the v4 read-path commit and deploy the prior schema-v3
image; do not leave mixed v3/v4 pods behind.

**Next:** AG-007.

**AG-006 handoff evidence (2026-07-26):** COMPLETE in `890c677`; evidence is
fixture only pending the AG-009 image rollout. Bootstrap is a strict
schema-v4 literal and rejects schema-v3 payloads, unknown fields, missing
AirGradient state, and arbitrary identifiers. The read adapter exposes the
seven fixed AirGradient aliases with 180-second freshness, redacted metadata,
Fahrenheit temperature, AirGradient-first CO2/humidity with Aranet fallback,
worst-current AirGradient/Coway PM2.5, source state, state version, fixed 0–100
brightness ranges, and closed option capabilities until runtime mappings are
added by AG-007. Both TypeScript builds and 133 tests passed, including stale,
unavailable, malformed, precedence, history, API, and compatibility cases.
Rollback is to revert `890c677`; schema-v3 clients must remain pinned to their
previous image and must not consume v4 responses. AG-007 is now unblocked.

### AG-007 — Control gateway

**Objective:** Safely expose only the five approved AirGradient settings.

**Prerequisites:** AG-002 and AG-006.

**Fixed interfaces:** Use the existing actions endpoint, five exact aliases and
commands, numeric ranges, runtime option capabilities, and fixed private Home
Assistant service mappings.

**Work:** Add strict command validation, expected-state preconditions,
idempotency/replay protection, origin/network enforcement, per-device and
per-client rate limits, fixed service dispatch, observed-state convergence,
timeouts, pending-action recovery, and redacted audits.

**Exclusions:** Calibration, firmware, cloud sharing, configuration-authority
changes, arbitrary Home Assistant services, optimistic success, and automatic
actions from sensor readings.

**Acceptance:** Tests cover success, convergence, timeout, duplicate replay,
stale version, invalid range/step/option, missing capability, unavailable
source, rejected origin/network, arbitrary identifiers, restart recovery,
rate limiting, and audit/log redaction.

**Rollback:** Revert the gateway changes and deploy the read-only v4 image; no
device setting is automatically reversed.

**Next:** AG-008.

**AG-007 handoff evidence (2026-07-26):** COMPLETE in `bf03e74`; evidence is
fixture only and live mutation remains an AG-009 acceptance gate. The existing
action endpoint accepts five strict AirGradient commands only: display
brightness, LED brightness, display temperature unit, PM standard, and LED
mode. Numeric values enforce integer 0–100 step 1; option values must be present
in runtime-advertised normalized allowlists and are translated through private
server mappings. Review confirmation, expected state version, 24-hour
idempotency, per-source rate limits, per-target concurrency, same-origin/private
network gates, exact Home Assistant services, observed-state convergence,
timeouts, failure handling, persistence, and redacted audits apply unchanged.
Calibration, firmware, cloud sharing, configuration authority, and arbitrary
Home Assistant actions remain structurally unrepresentable. A separate
write-capable token mount replaces reuse of the read-only adapter token.
Both TypeScript builds, 140 tests, IE-004 manifests, and diff/redaction checks
passed. Rollback is to revert `bf03e74`; before AG-009 the owner must recreate
the temporary `homepage-home-assistant-control-token` Secret from the retained
Home Assistant token and AG-009 must install the private five-entity mapping.

### AG-008 — Dashboard UI

**Objective:** Present the approved AirGradient readings, history, and reviewed
settings without weakening partial-state behavior.

**Prerequisites:** AG-006 and AG-007.

**Fixed interfaces:** Use the two cards, six graphs, graph order/ranges, and
capability-driven controls defined above.

**Work:** Implement the AirGradient + Nest card, compact Aranet card, six
graphs, capability-based settings, confirmation/review dialog, pending and
convergence states, error recovery, responsive layouts, and accessibility/E2E
coverage.

**Exclusions:** New backend commands, unadvertised controls, optimistic updates,
alert changes, and changes to existing refresh/custom-range/hover behavior.

**Acceptance:** UI tests cover both cards, six ordered graphs, fixed axes and
PM2.5 thresholds, capability omission, review and confirmation, keyboard use,
focus visibility, screen-reader labels, desktop/tablet/mobile widths, live
refresh, custom ranges, and partial/unavailable sources.

**Rollback:** Revert the UI commit and deploy the prior v4 read/control image;
Home Assistant remains independently usable.

**Next:** AG-009 after AG-004 is also complete.

### AG-009 — Production rollout

**Objective:** Prove the complete integration and deploy it through GitOps.

**Prerequisites:** AG-004 and AG-008.

**Fixed interfaces:** Immediate cutover is permitted only after all live checks
pass. Production images are immutable and digest-pinned. Git/Argo CD is the
only deployment and rollback path.

**Work:** Run the live outage/control matrix, build and scan images, publish the
immutable artifact, update the digest pin, deploy through Argo CD, validate live
state/history/actions, update the baseline status, and create
`docs/operations/indoor-dashboard-ie-015-evidence.md`.

**Exclusions:** Kubectl-ed production drift, a required multi-day soak, expanded
network access, new controls, or automatic equipment operation.

**Live acceptance:**

- Internet loss leaves local AirGradient readings available.
- Device loss/reboot and Home Assistant restart show truthful stale/unavailable
  state and recover.
- Prometheus loss removes history without changing current-state truth.
- All five settings enforce review, version, idempotency, convergence, rate
  limit, and redacted audit behavior.
- Firewall tests prove only the intended Home Assistant/k3s HTTP path.
- CO2/humidity precedence, worst-current Living Room PM2.5, Bedroom
  independence, and source-loss alerts pass.
- Both cards and all six graphs pass desktop and responsive checks.
- Built images pass tests and scanning, are digest-pinned, and Argo CD reports
  Synced and Healthy.
- A Git-only rollback to the previous production revision is proven, followed
  by forward recovery.

**Rollback:** Revert the production manifest and configuration commits through
Git, wait for Argo CD health, verify schema consistency and the previous indoor
dashboard, and leave Home Assistant's official integration intact unless the
owner explicitly decommissions it.

**Next:** None; close only after IE-015 contains redacted evidence for every
acceptance item.

## Test matrix

The package tests collectively prove:

| Area | Required coverage |
|---|---|
| Contracts | v3 clients reject v4; v4 rejects unknown fields, aliases, identifiers, commands, and capabilities |
| Adapter | current, stale, unavailable, malformed, Celsius conversion, fallback precedence, worst-current PM2.5, recovery |
| Alerts | one warning, one escalation, one recovery; source loss; stale exclusion; Bedroom independence |
| History | seven aliases across every supported window and custom ranges; arbitrary entities excluded; redaction |
| Controls | success, convergence, timeout, replay, stale state, invalid capability, unavailable source, origin/network rejection, rate limits, redaction |
| UI | six graphs, two cards, capability omission, confirmation, keyboard/focus, responsive layouts, partial sources |
| Live rollout | Internet loss, device loss/reboot, HA restart, Prometheus outage, five settings, firewall isolation, Argo health, Git-only rollback |

Tests must use deterministic fixtures unless a package explicitly authorizes
live evidence. A live test records only timestamps, canonical aliases, outcomes,
versions/digests, and redacted capability shapes.

## Documentation and evidence outputs

- This file is the controlling plan and package assignment.
- AG-001 amends inventory, schema v4, alerts, status, acceptance, and rollout
  sequence in `docs/overview/indoor-dashboard-baseline.md`.
- AG-009 creates
  `docs/operations/indoor-dashboard-ie-015-evidence.md` for onboarding,
  network, entity contract, tests, deployment, and rollback evidence.
- Each package updates only its own status/evidence and leaves unresolved owner
  gates explicit.

## Current status

| Package | Status | Evidence |
|---|---|---|
| AG-000 | COMPLETE when its documentation-only commit is recorded | This plan, documentation order, site index, sidebar, documentation build, link validation, and commit |
| AG-001 | COMPLETE | Contract baseline amendment committed and pushed |
| AG-002 | COMPLETE | Owner gate, firmware 3.6.2, local integration, cloud sharing off, least-privilege HTTP path, and redacted live evidence recorded above |
| AG-003 | COMPLETE | Canonical readings, private mappings, Fahrenheit normalization, 180-second freshness, source rollup, contract tests, restart recovery, and redacted live verification recorded above |
| AG-004 | COMPLETE | AirGradient CO2/humidity authority, worst-current PM2.5, source-loss incidents, deterministic safety tests, restart, and redacted live rollups recorded above |
| AG-005 | COMPLETE | Seven exact aliases and metrics, all bounded windows, 132 tests, manifest/redaction checks, and live Prometheus verification recorded above |
| AG-006 | COMPLETE | Strict schema v4, seven readings, capabilities, precedence/fallback, compatibility rejection, 133 tests, and fixture-only handoff recorded above |
| AG-007 | COMPLETE | Five strict commands, runtime capabilities, fixed HA services, convergence/replay/security gates, separate control token, 140 tests, and fixture-only evidence recorded above |
| AG-008 through AG-009 | NOT STARTED | Awaiting their listed prerequisites |
