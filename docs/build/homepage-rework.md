# Homelab Homepage Rework Build Plan

## Purpose

This plan turns the approved design in
[`docs/overview/homepage-architecture.md`](../overview/homepage-architecture.md)
into small, ordered implementation tasks. It is intended to be handed to a coding
agent and executed one task at a time.

The current `gethomepage/homepage` deployment is production and is the rollback
target. Do not replace it, rename it, or change its production ingress until the
cutover task explicitly says to do so.

Current status (2026-07-20): the custom application is deployed at its isolated
preview hostname and now serves production through the Git-managed
`homepage-custom-production` Service. The validated PDU mapping is enabled at Git revision
`c3d8968` with image digest
`sha256:d75558ed538c832d9f51259d022511619e44aac1af5d7c6c059d85ef97297dc5`.
The owner-approved shortened replacement Gate D soak passed its technical
closeout at `2026-07-20T21:37:34Z`. HP-029 production cutover completed at
commit `7309784`; the stock deployment remains the rollback target.

## Source of Truth and Fixed Scope

Before starting any task, read:

1. `docs/overview/homepage-architecture.md`
2. `docs/overview/infrastructure-reference.md`
3. `docs/overview/architecture-decisions.md`
4. `README.md`

The architecture document wins if this plan and an implementation detail appear
to conflict. Record a material ambiguity in the task handoff and stop rather than
silently changing the approved architecture.

The v1 application is:

- a TypeScript application with a React/Vite frontend and Fastify backend;
- a single stateless deployable container;
- driven by REST for bootstrap/history and SSE for live updates;
- read-only toward every infrastructure integration;
- deployed privately to k3s through GitOps; and
- introduced at a preview hostname before production cutover.

Use `homepage/` as the source root, with this target layout:

```text
homepage/
  package.json
  src/
    client/
    server/
    shared/
  config/
  public/
  tests/
  Dockerfile
```

Tests may live next to source when that is clearer. Do not move the existing
Kubernetes manifests merely to match the application source layout.

## Agent Execution Contract

For each task:

1. Confirm every prerequisite is complete.
2. Inspect the current worktree and preserve unrelated user changes.
3. Work only on the stated task. Do not bundle a later task for convenience.
4. Never place credentials, tokens, kubeconfigs, private URLs containing
   credentials, or decrypted Secrets in source, fixtures, screenshots, logs, or
   commits.
5. Add or update automated tests for behavior changed by the task.
6. Run the task's verification plus all cheap existing checks affected by it.
7. End with a short handoff containing files changed, commands run, results,
   assumptions, and the next unblocked task.
8. Mark a task complete only when every acceptance criterion passes. If a human
   gate is reached, stop and request approval.

Do not perform live cluster changes unless the active task explicitly authorizes
them. A local render or read-only cluster inspection is not a live change.

## Global Definition of Done

Every implementation task must satisfy all applicable items:

- TypeScript compiles without errors and lint passes.
- New behavior has deterministic tests; external APIs are mocked in tests.
- Loading, empty, stale, no-data, error, and recovery behavior are considered.
- UI controls are keyboard operable and visibly focused.
- State is not communicated by color alone.
- No secret reaches client bundles, REST/SSE payloads, logs, or Git.
- User-visible behavior works at desktop, tablet, and mobile widths.
- Documentation is updated when configuration, deployment, or operation changes.

## Work Sequence

The tasks are ordered. A task may begin only after all listed prerequisites are
complete. Human gates are deliberate pause points.

### Phase 0 — Discovery and Contracts

#### HP-001: Capture the implementation baseline

**Prerequisites:** None.

**Start:** The repository contains only the approved architecture and the current
stock Homepage deployment.

**Work:** Create `docs/overview/homepage-implementation-baseline.md`. Record the
current homepage manifests and image, service links that must survive the rework,
available monitoring components, planned preview hostname, expected application
ports, and the exact files that form the rollback target. Record unknowns as
explicit questions; do not invent answers.

**End:** The new document is a concise snapshot against which the rework and
rollback can be checked.

**Acceptance criteria:**

- Every link from the existing `services.yaml` and `bookmarks.yaml` is listed.
- The current image reference, Service, Ingress, ConfigMap, RBAC, and namespace
  are identified by file path and resource name.
- The document distinguishes verified facts, planned values, and unresolved
  inputs.
- No live resource is modified.

#### HP-002: Define the data-source and credential map

**Prerequisites:** HP-001.

**Start:** The integration list exists only at architecture level.

**Work:** Create `docs/overview/homepage-data-sources.md` with one row per
integration: Prometheus, Alertmanager, k3s API, future OKD API, Argo CD, both
Proxmox hosts, PBS, UniFi, Glances bridge, service probes, Open-Meteo, and optional
USP-PDU-PRO. For each, specify owner, base endpoint without credentials, protocol,
required read-only permissions, secret name/key placeholders, polling interval,
timeout, cache/freshness rule, redaction rule, and fixture status.

**End:** Every adapter has enough contract information to implement or is marked
`BLOCKED` with a precise missing input.

**Acceptance criteria:**

- The browser-facing versus server-only boundary is explicit for every source.
- Each credentialed source has a least-privilege requirement and Kubernetes
  Secret reference, never a plaintext value.
- Optional or unavailable systems have defined `NOT PROVISIONED` or
  `NOT SUPPORTED` behavior.
- The document includes an approval block for the owner to sign off.

### Gate A: Baseline and data-source approval

Stop until the owner approves HP-001 and HP-002. Integration implementation must
not begin before this approval; fixture-based UI work may proceed after approval.

### Phase 1 — Application Foundation

#### HP-003: Scaffold the TypeScript workspace

**Prerequisites:** Gate A.

**Start:** `homepage/` does not exist.

**Work:** Create the minimal npm workspace in `homepage/` for React, Vite,
Fastify, shared TypeScript code, Vitest, Testing Library, ESLint, and Prettier. Add
scripts for `dev`, `build`, `start`, `lint`, `typecheck`, `test`, and
`test:integration`. Pin the runtime with `.nvmrc` or the package `engines` field.

**End:** A minimal client and server build locally without domain features.

**Acceptance criteria:**

- `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and
  `npm run build` succeed from `homepage/`.
- Development starts the Vite client and Fastify API with documented commands.
- Production start serves the built client and API from one process/port.
- No Kubernetes manifest or current Homepage resource changes.

#### HP-004: Define shared domain contracts and fixtures

**Prerequisites:** HP-003.

**Start:** The workspace contains no homelab domain model.

**Work:** Add shared, runtime-validated contracts for severity, freshness,
source metadata, alerts, time series, hosts, clusters, network, storage/backups,
services, and weather. Add deterministic fixture sets covering healthy, warning,
critical, stale, no-data, not-provisioned, and unsupported states.

**End:** Client and server import the same validated contracts and tests can use
the fixture sets without infrastructure access.

**Acceptance criteria:**

- Severity is limited to `OK`, `INFO`, `WARN`, and `CRIT`.
- Freshness distinguishes current, stale, no data, not provisioned, and not
  supported.
- All fixture files validate at test time.
- Contracts do not expose fields intended to hold upstream credentials.

#### HP-005: Add the backend shell and bootstrap API

**Prerequisites:** HP-004.

**Start:** The production server has no application endpoints.

**Work:** Implement structured configuration loading, redacted structured logs,
request IDs, error handling, `/api/health/live`, `/api/health/ready`, and a
fixture-backed `/api/v1/bootstrap`. Add clean shutdown behavior.

**End:** The server exposes a stable bootstrap contract and operational health
checks using fixture data.

**Acceptance criteria:**

- Endpoint contract tests cover success, invalid configuration, and internal
  failure behavior.
- Liveness checks process health; readiness checks application initialization.
- Logs never serialize authorization headers, cookies, tokens, or secret values.
- SIGTERM stops accepting requests and exits cleanly within the configured grace
  period.

### Phase 2 — Approved UI Using Fake Data

#### HP-006: Implement design tokens and appearance modes

**Prerequisites:** HP-004.

**Start:** The client has only scaffold styling.

**Work:** Implement the canonical btop-inspired dark tokens from the architecture,
a proposed accessible light token set, monospace typography, spacing, borders,
focus, state patterns, reduced motion, high contrast, and dark/light/auto mode
selection. Persist only the explicit browser override.

**End:** A visual test page renders every token, state, control, and typography
level in all appearance modes.

**Acceptance criteria:**

- Dark values exactly match the architecture table.
- Auto follows `prefers-color-scheme`; changing the system preference updates an
  unoverridden page.
- Ordinary text and controls meet WCAG 2.2 AA contrast targets.
- State samples remain distinguishable in grayscale and without animation.

#### HP-007: Build reusable panels and graph primitives

**Prerequisites:** HP-006.

**Start:** No production dashboard components exist.

**Work:** Build panel, metric, state badge, freshness label, sparkline/time-series,
empty-state, loading-state, and detail-drawer primitives. Implement the
dot-matrix/braille-inspired CPU and network graph with an accessible text summary.

**End:** A component gallery demonstrates all variants with deterministic fixture
data.

**Acceptance criteria:**

- Graphs resize without clipping at 320 px through desktop widths.
- Graphs represent 5-minute, 15-minute, and 1-hour windows.
- Screen readers receive a useful metric summary without reading every point.
- Panels support pointer and keyboard expansion and have a distinct labeled
  `Open` action where applicable.

#### HP-007A: Produce high-fidelity fixture mockups

**Prerequisites:** HP-007.

**Start:** The visual system exists as isolated components but has not been
evaluated as a complete screen.

**Work:** Compose representative, non-integrated Overview screens using the real
components and fixtures. Cover desktop and mobile, dark and proposed light modes,
healthy and degraded states, an expanded panel, search, and the appearance/help
controls. Capture reproducible screenshots and document design decisions in
`docs/overview/homepage-ui-approval.md`.

**End:** The owner can judge the intended v1 visual language and information
density without waiting for integrations or the complete routed application.

**Acceptance criteria:**

- Screens are high fidelity and use the same components/tokens intended for
  production, not a disconnected drawing.
- Desktop and 320 px mobile compositions contain representative real labels and
  fake values.
- Dark, light, stale, warning, critical, focus, and expanded states are visible.
- The approval document identifies any deliberate difference from the
  architecture.

### Gate B1: High-fidelity mockup approval

Stop until the owner approves the HP-007A desktop/mobile mockups, graph style,
dark appearance, proposed light appearance, and information density. Record the
decision and required revisions in `docs/overview/homepage-ui-approval.md`.

#### HP-008: Build the responsive application shell

**Prerequisites:** Gate B1.

**Start:** Components have no routed application frame.

**Work:** Build the global header, product switcher, active-cluster label, global
state, search affordance, Portland clock, appearance control, help indicator,
primary view navigation, main content region, and route/not-found behavior.

**End:** Every approved view is navigable through the shell and contains a named
placeholder.

**Acceptance criteria:**

- Overview, Compute, Network, Storage/Backups, Kubernetes, OKD, Services, and
  Weather have stable routes.
- Header content does not overlap at 320 px, tablet, or desktop widths.
- Mobile navigation is touch friendly and does not require drag/resize.
- The Docs switcher target is `https://docs.lab.seandre.dev`.

#### HP-009A: Implement Overview with fixtures

**Prerequisites:** HP-008.

**Start:** The Overview route contains the approved HP-007A fixture composition.

**Work:** Implement global state, alerts, matching `pve-01`/`pve-02` summaries,
aggregate k3s/future OKD health, network summary, service status, and weather using
fixtures.

**End:** Overview is complete with fake data and no backend integration.

**Acceptance criteria:**

- Both Proxmox summaries show CPU, CPU temperature, used/installed memory, and
  network ingress/egress in the same order.
- Unprovisioned OKD is neutral and never raises global severity.
- Alerts and degraded sources are readable without overwhelming healthy state.
- Visual tests cover healthy, mixed severity, stale, and mobile states.

#### HP-009B: Implement Compute with fixtures

**Prerequisites:** HP-008.

**Start:** The Compute route contains a placeholder and HP-009A has established
the host summary hierarchy.

**Work:** Implement matching Proxmox host panels and drill-down, k3s node cards,
aggregate future OKD card, and individual future OKD node states using fixtures.

**End:** Compute is complete with fake data and no backend integration.

**Acceptance criteria:**

- Host drill-down contains every metric listed in the architecture or an explicit
  unsupported state.
- Matching host data uses the same component and field order.
- Future OKD nodes are not provisioned and do not affect global severity.
- Visual tests cover host failure, partial sensor data, and mobile expansion.

#### HP-010A: Implement Network with fixtures

**Prerequisites:** HP-008.

**Start:** The Network route contains a placeholder.

**Work:** Implement gateway/Internet latency, ingress VIPs, UniFi state, network
graphs, and existing speed-test results using fixtures.

**End:** Network is complete with fake data and no write-capable controls.

**Acceptance criteria:**

- The interface cannot trigger a speed test or network remediation.
- Latency targets are labeled and distinguish ICMP from TCP/HTTPS timing.
- Planned OKD endpoints render as not provisioned rather than failed.
- Throughput and latency show stale, no-data, and partial-source states.

#### HP-010B: Implement Storage/Backups with fixtures

**Prerequisites:** HP-008.

**Start:** The Storage/Backups route contains a placeholder.

**Work:** Implement host storage drill-down, PBS reachability, datastore state,
backup age, and failure summaries using fixtures.

**End:** Storage/Backups is complete with fake data and no write-capable controls.

**Acceptance criteria:**

- The interface cannot start a backup, restore data, or remediate a failure.
- Backup age and failure thresholds come from configuration fixtures.
- Reachability, datastore state, backup freshness, and job failure remain distinct.
- Tests cover healthy, old, failed, unreachable, and no-data states.

#### HP-011: Implement Kubernetes and OKD with fixtures

**Prerequisites:** HP-008.

**Start:** Kubernetes and OKD routes contain placeholders.

**Work:** Implement k3s control-plane/node health, capacity/use summaries,
unhealthy workloads, relevant alerts, and the OKD not-provisioned experience.
Include fixture-ready future OKD aggregate and node panels without activating
them.

**End:** Cluster views express every approved lifecycle state without requiring a
live cluster.

**Acceptance criteria:**

- Counts and severity can be traced to visible fixture inputs in tests.
- Unhealthy workloads link only to approved read-only destinations.
- The initial OKD route clearly says `NOT PROVISIONED` and is not an error page.
- k3s and future OKD use the same state vocabulary.

#### HP-012A: Implement Services with fixtures

**Prerequisites:** HP-008.

**Start:** The Services route contains a placeholder.

**Work:** Implement the searchable service launcher with all links captured in
HP-001. Render server-side reachability separately from the link action.

**End:** Services is feature complete against fixtures.

**Acceptance criteria:**

- All existing Homepage service and bookmark destinations remain available.
- External/service opens use safe new-tab behavior and have accessible labels.
- Reachability is explicitly labeled as a server-side check.
- Empty, filtered, unreachable, and stale states have tests.

#### HP-012B: Implement Weather with fixtures

**Prerequisites:** HP-008.

**Start:** The Weather route contains a placeholder.

**Work:** Implement conditions, icon, sunrise/sunset, U.S. AQI, PM2.5, and PM10
for Portland `97209` using fixtures.

**End:** Weather is feature complete against fixtures.

**Acceptance criteria:**

- Weather shows observation time and stale/no-data behavior.
- Units and AQI system are labeled rather than inferred from values.
- Weather and air-quality partial failures degrade independently.
- Visual tests cover desktop/mobile and healthy/stale/no-data states.

#### HP-013: Add local search and keyboard controls

**Prerequisites:** HP-009A through HP-012B.

**Start:** The UI relies on pointer navigation and route links.

**Work:** Implement ranked local search for services, hosts, documentation,
runbooks, and actions, followed by an explicit DuckDuckGo web-search result.
Implement `/`, arrows, `h/j/k/l`, `Esc`, `?`, number-key view switching, `Enter`,
and `Shift+Enter` behavior from the architecture.

**End:** The entire shell can be efficiently operated from the keyboard.

**Acceptance criteria:**

- Automated interaction tests cover every documented shortcut.
- Shortcuts do not fire while typing into inputs except the input-specific keys.
- Focus order and focus restoration are deterministic after closing overlays.
- Local results always rank ahead of the explicit web-search option.

#### HP-014: Add browser-local layout customization

**Prerequisites:** HP-009A through HP-012B.

**Start:** Layout is fixed to Git-defined defaults.

**Work:** Add deliberate desktop/tablet edit mode for panel move/resize, reset to
Git defaults, and versioned JSON export/import. Persist layout, panel sizes,
appearance override, graph window, and dismissible hints locally. Provide a
non-drag mobile ordering experience or preserve the Git order.

**End:** Local customization is reversible and cannot affect health or integration
configuration.

**Acceptance criteria:**

- Invalid or incompatible imports fail safely with a useful message.
- Reset removes overrides and exactly restores current Git defaults.
- Local data contains no credentials, backend endpoints, or severity thresholds.
- Mobile usage never requires drag/resize.

### Gate B2: Responsive shell and interaction approval

Run the complete fixture UI at desktop, tablet, and mobile sizes. Stop until the
owner approves dark/light/auto appearance, information density, all views,
keyboard behavior, graph style, and mobile behavior. Record approval and requested
changes in `docs/overview/homepage-ui-approval.md`. Do not start real integrations
before this gate passes.

### Phase 3 — Backend Runtime and Public Contracts

#### HP-015: Implement normalization, freshness, and severity

**Prerequisites:** Gate B2, HP-005.

**Start:** Bootstrap returns static fixtures.

**Work:** Implement source-independent normalization, last-good-value caching,
sample timestamps, stale ages, no-data handling, planned/unsupported states,
threshold evaluation, global severity aggregation, timeouts, and circuit-breaker
state. Use an injectable clock.

**End:** Deterministic services turn adapter samples and failures into shared
domain contracts.

**Acceptance criteria:**

- Unit tests cover first failure, two consecutive failures, recovery after two
  successes, stale aging, never-sampled, planned, and unsupported behavior.
- A failed source retains only its last known safe value and labels its age.
- Planned inactive systems do not worsen global severity.
- No adapter-specific payload shape leaks into client contracts.

#### HP-016: Implement history REST and live SSE delivery

**Prerequisites:** HP-015.

**Start:** The client can fetch bootstrap only.

**Work:** Add validated history endpoints and an authenticated-by-network SSE
stream for normalized updates. Add event IDs, keepalive, reconnect/resume behavior,
backpressure protection, and reduced polling/stream processing while the page is
hidden. Connect the client data layer to REST/SSE with fixture mode retained for
tests.

**End:** Fixture-driven updates flow end to end through production interfaces.

**Acceptance criteria:**

- Contract/integration tests cover initial load, ordered updates, reconnect,
  missed-event recovery, malformed events, and server shutdown.
- Graph window changes fetch the correct history range.
- Hidden-tab behavior measurably reduces work while freshness remains accurate.
- A slow or disconnected browser cannot grow server memory without bound.

#### HP-017: Implement allowlisted configuration and probe controls

**Prerequisites:** HP-015.

**Start:** Endpoints and probes are not controlled by a production configuration
schema.

**Work:** Add runtime-validated, Git-owned configuration for views, default
layouts, service links, data sources, probes, thresholds, and feature flags.
Reject arbitrary client-supplied probe targets and unsafe protocols. Add config
examples containing no secrets.

**End:** The backend starts only from valid allowlisted configuration.

**Acceptance criteria:**

- Unknown fields, invalid URLs, duplicate IDs, and invalid thresholds fail at
  startup with redacted messages.
- Probe targets cannot be selected or overridden by a browser request.
- Configuration tests cover private IPs and hostnames that are intentionally
  allowed without enabling general SSRF.
- Feature-disabled sources return the correct planned/unsupported state.

### Phase 4 — Integrations, One Source at a Time

Every adapter below must implement the approved HP-002 contract, use bounded
timeouts, expose freshness metadata, redact upstream errors, and have fixture-based
tests before any live read-only verification.

#### HP-018: Add Open-Meteo weather and AQI adapters

**Prerequisites:** HP-016, HP-017.

**Start:** Weather uses fixtures.

**Work:** Add server adapters for current weather and air quality for Portland
`97209`, cache results, normalize observation times/units, and wire the Weather
view to live contracts.

**End:** Weather works through the backend with graceful stale/no-data behavior.

**Acceptance criteria:**

- Tests use recorded/minimal synthetic responses, not live network calls.
- The browser never calls Open-Meteo directly.
- Rate limiting, malformed data, and partial weather/AQI failure are covered.
- Imperial units and U.S. AQI labeling match the approved UI.

#### HP-019: Add service reachability and latency probes

**Prerequisites:** HP-016, HP-017.

**Start:** Service status and latency use fixtures.

**Work:** Implement the allowlisted 15-second checks and latency measurements
defined in the architecture and HP-002. Use DNS+HTTPS for Internet state and
TCP/HTTPS timing when ICMP is unavailable.

**End:** Network and Services views use normalized server-side probe results.

**Acceptance criteria:**

- Two-failure/two-success transitions are proven by tests.
- Redirect policy, TLS validation, timeout, response-size limit, and concurrency
  limit are explicit.
- Response bodies are not retained unless a narrowly scoped health check needs a
  bounded field.
- The endpoint cannot be used as an open proxy or arbitrary port scanner.

#### HP-020A: Add the Prometheus adapter

**Prerequisites:** HP-016, HP-017.

**Start:** Host and cluster current/history metrics use fixtures.

**Work:** Implement allowlisted instant/range Prometheus queries for host, k3s,
network, and storage contracts. Keep queries in Git-owned configuration or typed
code, not browser input.

**End:** Approved current metrics and selectable history use Prometheus with
fixture fallback in tests.

**Acceptance criteria:**

- Query construction cannot accept arbitrary PromQL from a client.
- Range queries enforce maximum duration and sample count.
- Partial query failure degrades only affected panels and records source age.
- Units, labels, and timestamps normalize before entering shared contracts.

#### HP-020B: Add the Alertmanager adapter

**Prerequisites:** HP-016, HP-017.

**Start:** Active alerts use fixtures.

**Work:** Implement read-only Alertmanager retrieval, allowlist client-visible
labels/annotations, normalize severity and source, and wire alerts into global and
relevant view summaries.

**End:** Active alerts use Alertmanager with safe fixture fallback in tests.

**Acceptance criteria:**

- Alert labels/annotations are allowlisted before reaching the browser.
- Silence, acknowledgement, deletion, and other write operations do not exist.
- Duplicate/grouped alerts have deterministic normalization tests.
- Alertmanager failure does not erase the last good alerts without a stale label.

#### HP-021A: Add the k3s API adapter and RBAC

**Prerequisites:** HP-020A.

**Start:** Kubernetes operational state beyond Prometheus uses fixtures.

**Work:** Add a least-privilege, read-only adapter for Kubernetes node/workload
summary. Define required RBAC in a separate manifest change without granting
Secret read access.

**End:** Kubernetes and relevant Overview panels use normalized k3s API state.

**Acceptance criteria:**

- RBAC enumerates only required resources and verbs; no wildcard resources or
  verbs and no Secret access.
- Workload and node count normalization has contract tests.
- API permission denial produces a scoped stale/no-data state.
- The service account cannot create, update, patch, delete, exec, or port-forward.

#### HP-021B: Add the Argo CD adapter

**Prerequisites:** HP-016, HP-017.

**Start:** Argo CD health/sync state uses fixtures.

**Work:** Add a read-only adapter for approved Argo CD application health and sync
state using the HP-002 credential boundary.

**End:** Overview and Kubernetes show normalized Argo CD state.

**Acceptance criteria:**

- Health and sync combinations have deterministic normalization tests.
- The adapter cannot sync, refresh, terminate, patch, or delete applications.
- Repository details and fields outside the client allowlist never leave the
  backend.
- Permission denial and unavailable API degrade only Argo-derived state.

#### HP-022A: Add the Proxmox adapter

**Prerequisites:** HP-016, HP-017; owner-provisioned read-only credentials from
HP-002.

**Start:** Proxmox product-API details use fixtures.

**Work:** Add a read-only Proxmox adapter for both hosts, including node state,
guest counts, uptime, memory, swap, storage, and fields approved in HP-002. Keep
credentials server-side.

**End:** Compute uses normalized Proxmox state for both hosts.

**Acceptance criteria:**

- Both Proxmox hosts map to the identical summary schema.
- Tests cover unavailable host, stopped/running guests, partial node data, and
  permission denial.
- TLS verification behavior is explicit; insecure verification is not silently
  enabled.
- Tokens, ticket data, task logs, guest names not approved for display, and raw
  upstream errors never reach the browser or normal logs.

#### HP-022B: Add the temporary Glances adapter

**Prerequisites:** HP-016, HP-017.

**Start:** Sensor, disk I/O, and bridge metrics supplied by Glances use fixtures.

**Work:** Add the bounded read-only Glances bridge defined in HP-002 and normalize
only approved fields. Treat it as a replaceable telemetry source, not a client
contract.

**End:** Supported temporary metrics appear in Compute with correct freshness.

**Acceptance criteria:**

- Tests cover missing sensors, renamed devices, partial responses, timeout, and
  recovery.
- Raw Glances response shapes never reach the browser.
- Host/device mapping is Git-owned and cannot be changed by a client.
- The implementation and docs clearly identify Glances as temporary.

#### HP-022C: Add the PBS adapter

**Prerequisites:** HP-016, HP-017; owner-provisioned read-only credentials from
HP-002.

**Start:** PBS datastore and backup state use fixtures.

**Work:** Add a read-only PBS adapter for reachability, datastore state, backup
freshness, and failure state.

**End:** Storage/Backups uses normalized PBS state.

**Acceptance criteria:**

- Tests cover unreachable PBS, old backup, failed backup, empty datastore result,
  and permission denial.
- The adapter exposes no backup, prune, restore, verify, or task-control action.
- Backup identifiers/owner fields outside the approved display allowlist are
  removed.
- TLS and credential redaction behavior match the Proxmox adapter standard.

#### HP-023A: Add the UniFi adapter

**Prerequisites:** HP-016, HP-017; owner-approved supported APIs and read-only
credentials from HP-002.

**Start:** UniFi state and speed-test history use fixtures.

**Work:** Add a read-only UniFi adapter for controller/network state and existing
speed-test history.

**End:** Network shows verified UniFi data without action capability.

**Acceptance criteria:**

- No request path can start a speed test or issue a UniFi write.
- Sanitized contract tests cover authentication failure and API version drift.
- Client-visible device/site fields follow the HP-002 allowlist.
- Controller failure does not incorrectly label general Internet state as down.

#### HP-023B: Resolve the optional PDU integration

**Status:** Complete in preview on 2026-07-20 at `c3d8968`. The supported path
uses hardened UnPoller against the local UniFi API with a manually managed API
key, pinned certificate, and strict TLS. Prometheus retains only
`unpoller_device_outlet_outlet_power` plus scrape health. Bootstrap schema v2
returns total measured watts and exact `pve-01`/`pve-02` host watts without
public labels or identifiers. OKD-labeled outlets contribute only to total.

**Prerequisites:** HP-002, HP-016, HP-017.

**Start:** PDU capability is either verified as supported/read-only or marked
unsupported in HP-002.

**Work:** If a supported read-only interface is verified, implement the narrow
adapter for total and labeled per-outlet measured wattage. Otherwise, implement
only the explicit `NOT SUPPORTED` state and document the evidence/decision.

**End:** PDU status is honest and complete without blocking v1.

**Acceptance criteria:**

- Optional PDU absence or unsupported status does not affect global health.
- Measured wattage is labeled as measured; no estimated power is invented.
- If implemented, tests prove the adapter has no outlet-control path.
- If unsupported, no credential or speculative endpoint is added.

### Gate C: Integration and security approval

Run integration tests plus live read-only checks from an approved environment.
Confirm every adapter's least-privilege identity, client-payload fields, logs,
timeouts, failure state, and recovery. Stop until the owner approves the completed
integration matrix. Unsupported optional integrations may remain explicitly
unsupported.

### Phase 5 — Quality, Packaging, and GitOps Preview

#### HP-024: Complete accessibility and browser end-to-end coverage

**Prerequisites:** Gate C.

**Start:** Component and adapter tests pass, but the full product has not passed a
browser quality gate.

**Work:** Add Playwright end-to-end coverage for core views, shortcuts, service
opening, details, theme modes, layout import/export/reset, SSE recovery, and error
states. Add automated axe checks and representative visual snapshots at 320 px,
tablet, and desktop widths.

**End:** The critical user journeys and approved mockups are regression tested.

**Acceptance criteria:**

- No serious or critical automated accessibility violations remain.
- Every interactive feature is tested without a mouse.
- Reduced-motion mode and visible focus pass browser tests.
- Visual snapshots cover healthy plus degraded/stale states in dark and light
  appearance.

#### HP-025: Harden and verify the production container

**Prerequisites:** HP-024.

**Start:** The app builds locally but has no approved runtime image.

**Work:** Add a multi-stage Dockerfile and `.dockerignore`. Run as a fixed
non-root user, include only production artifacts, use an init strategy if needed,
support read-only root filesystem operation, and expose the health endpoints.

**End:** One container serves client/API/SSE and passes local runtime tests.

**Acceptance criteria:**

- Image build is reproducible from a clean checkout and lockfile.
- The container runs as non-root with dropped capabilities and no shell/package
  manager requirement at runtime where feasible.
- Liveness, readiness, SIGTERM, and SSE shutdown behavior pass container tests.
- An image scan has no unreviewed critical or high vulnerabilities.

#### HP-026: Add CI, image publishing, SBOM, and provenance

**Prerequisites:** HP-025.

**Start:** No homepage-specific workflow exists.

**Work:** Add a least-privilege GitHub Actions workflow that runs lint,
typecheck, unit/integration/e2e accessibility tests, builds once, scans the image,
generates an SBOM and provenance, and publishes a private immutable GHCR image.
Do not automate a production manifest update yet.

**End:** A branch/PR proves checks; an authorized main build publishes a traceable
image.

**Acceptance criteria:**

- Workflow permissions are explicit and minimal.
- Untrusted pull requests cannot access publishing credentials.
- The deployed artifact can be selected by `sha256:` digest.
- Scan, SBOM, and provenance results are retained or attached to the image.

#### HP-027: Add parallel preview Kubernetes manifests

**Prerequisites:** HP-026.

**Start:** Only the stock `homepage` workload owns the production service and
hostname.

**Work:** Add a separately named custom-app Deployment, Service, ConfigMap,
ServiceAccount/RBAC, NetworkPolicy, PodDisruptionBudget, and preview Ingress at the
hostname approved in HP-001. Use two replicas, rolling update, probes, resource
requests/limits, topology spread, read-only filesystem, immutable image digest,
and required Secret references. Do not change production ingress/service.

**End:** Kustomize renders a complete parallel preview deployment.

**Acceptance criteria:**

- `kubectl kustomize` succeeds and static schema/policy validation passes.
- Names/selectors cannot collide with the stock Homepage resources.
- The image is referenced by digest, not mutable tag.
- NetworkPolicy permits only required ingress, DNS, and approved upstream egress.
- Missing credentials prevent only their adapters or pod readiness as explicitly
  designed; no plaintext Secret is committed.

#### HP-028: Document credential provisioning and rollback

**Prerequisites:** HP-027.

**Start:** Manifests reference Secrets and a rollback target, but operators lack a
single tested runbook.

**Work:** Create `docs/operations/homepage-rework.md` covering private GHCR pull
access, sealed/read-only integration Secret provisioning, preview checks,
credential rotation, log/client-bundle secret audit, production cutover, rollback
to the stock manifests, and post-rollback verification. Keep commands safe and
non-secret-bearing.

**End:** An operator can provision, validate, cut over, and roll back without
improvising.

**Acceptance criteria:**

- The runbook names exact Kubernetes resources and expected healthy output.
- Rollback does not depend on rebuilding or deleting the stock ConfigMap.
- Secret values are sourced without printing or putting them in shell history.
- Failure cases cover image pull, bad config, missing adapter permission, failed
  rollout, and failed certificate/ingress.

### Gate D: Preview deployment approval

Provision approved Secrets and deploy the preview through the existing Argo CD
flow. Verify two replicas, spread, probes, every view, live/stale/recovery behavior,
links, responsive layouts, keyboard/accessibility, logs, resource use, and at least
one pod replacement. Run for an owner-approved soak period. Record results in the
runbook and stop until the owner approves cutover.

#### HP-029: Cut over production traffic

**Status:** Completed 2026-07-20 in Git commit `7309784`; production smoke and
stability evidence is recorded in the [Homepage rework runbook](../operations/homepage-rework.md#hp-029-production-cutover--2026-07-20).

**Prerequisites:** Gate D; a confirmed stock rollback procedure and owner approval
for a production change window.

**Start:** The custom app is healthy at preview; the stock app owns
`home.lab.seandre.dev`.

**Work:** Change Git-managed Service/Ingress ownership so the approved custom app
serves `home.lab.seandre.dev`. Preserve stock deployment/configuration as a named,
non-serving rollback target. Reconcile through Argo CD and execute production
smoke checks.

**End:** Production serves the custom app and the stock rollback target remains
intact.

**Acceptance criteria:**

- TLS, bootstrap, SSE, all routes, service links, and health endpoints work at the
  production hostname.
- Argo CD reports the relevant applications `Synced` and `Healthy`.
- No request is routed to both old and new selectors accidentally.
- Error rate, restart count, resource use, and adapter states remain acceptable
  through the defined observation window.

#### HP-030: Execute and document the rollback drill

**Prerequisites:** HP-029.

**Start:** Production uses the custom app and the preserved stock target is
available.

**Work:** During an approved window, follow the runbook to restore production
traffic to the stock Homepage, verify it, then return traffic to the custom app and
verify again. Record timings, exact revisions, observations, and corrections.

**End:** Both rollback and forward recovery have been demonstrated from Git.

**Acceptance criteria:**

- The stock Homepage returns without rebuilding its ConfigMap or image.
- Existing links and widgets work after rollback.
- The custom app returns without lost Git-defined or browser-local defaults.
- The runbook contains measured recovery time and all fixes discovered by the
  drill.

#### HP-031: Close v1 and update repository documentation

**Prerequisites:** HP-030.

**Start:** Custom production and rollback have passed, but repository status still
describes the old state.

**Work:** Update README status/repo map, architecture implementation status,
documentation order, operations references, and the decision log as needed. Mark
each v1 acceptance criterion with evidence. Create a deferred backlog for OKD
overlay/manual switching and the separate automatic-failover infrastructure
project.

**End:** Documentation accurately describes the running system and remaining
scope.

**Acceptance criteria:**

- Every v1 criterion in the architecture links to a test, review, workflow run,
  manifest, or drill record.
- OKD deployment and automatic failover remain explicitly outside v1 completion.
- The stock deployment's retention/removal decision is documented; it is not
  removed as part of this task without a separate approved plan.
- A clean-clone contributor can find build, test, preview, deploy, and rollback
  instructions from README/documentation order.

## Final v1 Evidence Checklist

- [ ] Gate A — baseline and data-source map approved.
- [x] Gate B1 — high-fidelity desktop/mobile mockups approved (2026-07-19).
- [x] Gate B2 — responsive shell and interactions approved (2026-07-19).
- [x] Gate C — integrations and least-privilege security approved (2026-07-20).
- [x] Gate D — preview deployment and owner-approved shortened soak passed
  technical closeout at `2026-07-20T21:37:34Z`. Production traffic is unchanged;
  HP-029 remains a separate approval.
- [ ] All agreed links and daily utilities are present.
- [ ] Live, stale, no-data, not-provisioned, and unsupported states are distinct.
- [ ] Proxmox summaries match and btop-style graphs are responsive.
- [ ] No integration supports writes or exposes credentials.
- [ ] Accessibility and responsive browser suites pass.
- [ ] Private image is scanned, has SBOM/provenance, and deploys by digest.
- [ ] Production cutover passes.
- [ ] Stock Homepage rollback and forward recovery drills pass.

## Explicitly Deferred Work

Do not absorb these into v1 tasks:

- OKD deployment overlays or production ownership.
- Cross-cluster automatic failover or a 30-second recovery claim.
- Household portal access, smart-home data, or device control.
- Application authentication or an application database.
- Alert acknowledgement, silencing, restarts, backups, restores, speed-test
  triggers, or any other write/remediation action.
- Estimated power consumption.
