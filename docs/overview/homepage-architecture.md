# Overview 04: Homelab Homepage Architecture

> Status: approved architecture; implementation has not started. The existing Homepage deployment remains the production and rollback target until the acceptance gates in this document pass.

This document defines the product, application, telemetry, security, and deployment architecture for a custom homelab homepage inspired by the default [btop](https://github.com/aristocratos/btop) interface.

## Product Intent

`Homelab` is a private, responsive operations homepage. Its priorities are:

1. live infrastructure monitoring;
2. daily utility;
3. fast service launching;
4. homelab showcase; and
5. incident awareness.

The interface must remain modern, simple, readable, and resistant to information overload. It summarizes state and links to the systems of record; it does not replace Grafana, Argo CD, Proxmox, UniFi, PBS, or their administrative interfaces.

## v1 Scope

### Included

- Private deployment on k3s at `home.lab.seandre.dev`.
- Overview, Compute, Network, Storage/Backups, Kubernetes, OKD, Services, and Weather views.
- Default btop visual language and exact dark-theme palette.
- Light, dark, and system-auto appearance modes.
- Dot-matrix/braille-inspired CPU and network graphs.
- Five-second live metric refresh.
- Fifteen-minute default graphs with 5-minute, 15-minute, and 1-hour selections.
- Reduced polling while the browser tab is hidden.
- Proxmox host summaries and drill-down for `pve-01` and `pve-02`.
- High-level k3s state and a placeholder-aware OKD view before OKD exists.
- Read-only alert aggregation, service reachability, and latency.
- Existing UniFi speed-test results without triggering new tests.
- Optional USP-PDU-PRO power data if a supported read-only interface is verified.
- Portland `97209` weather, sunrise/sunset, U.S. AQI, PM2.5, and PM10.
- Infrastructure and web search.
- Responsive desktop, tablet, and mobile experiences.
- Keyboard navigation and command-oriented search.
- Git-defined layouts with per-browser customization.
- A private OCI image built through GitHub Actions and stored in GHCR.
- GitOps deployment and a tested rollback to the existing Homepage application.

### Excluded

- Operating-system process lists.
- Alert acknowledgement, silencing, restart, or remediation actions.
- Triggering Internet speed tests.
- Smart-home data or control.
- Application authentication.
- Household-wide access.
- Automatic cross-cluster failover.
- An application database.
- Estimated power consumption.

## Experience Architecture

### Global Header

The compact terminal-style header displays:

- `Homelab`;
- a `Homepage`/`Docs` product switcher reciprocal to the documentation site's selector;
- active hosting cluster, `k3s` or `OKD`;
- global `OK`, `INFO`, `WARN`, or `CRIT` state;
- search;
- Portland date and time;
- appearance mode; and
- keyboard-help indicator.

### Views

| View | Primary content |
|---|---|
| Overview | Global state, active alerts, Proxmox summaries, aggregate k3s/OKD health, network summary, service status, and weather |
| Compute | Matching `pve-01`/`pve-02` panels, future aggregate and individual OKD nodes, and k3s nodes |
| Network | Gateway/Internet latency, ingress VIPs, UniFi state, network graphs, and existing speed-test results |
| Storage/Backups | Host storage drill-down, PBS reachability, datastore state, and backup age/failure state |
| Kubernetes | k3s node and control-plane health, resource summary, unhealthy workloads, and relevant alerts |
| OKD | `NOT PROVISIONED` initially; later cluster summary and individual control-plane nodes |
| Services | Searchable launcher, server-side reachability, status, and relevant drill-down links |
| Weather | Current conditions, icon, sunrise/sunset, U.S. AQI, PM2.5, and PM10 for Portland `97209` |

### Proxmox Panels

Both Proxmox hosts use the same overview hierarchy:

- total CPU utilization;
- CPU temperature;
- installed and used memory; and
- network ingress and egress.

Drill-down adds per-core utilization, load average, CPU clock, measured power when available, swap, storage capacity and use, disk I/O, uptime, and running/stopped VM and container counts. Static host and CPU model labels do not occupy overview space.

Once OKD is operational, Overview shows an aggregate OKD panel and Compute exposes matching individual panels for `okd-cp-01`, `okd-cp-02`, and `okd-cp-03`.

### Responsive and Keyboard Behavior

- Desktop and tablet use a CSS grid with a deliberate edit mode for drag and resize.
- Mobile uses a first-class stacked layout with touch-friendly expansion and no routine drag/resize.
- All device classes expose the same state semantics and underlying data.
- Clicking or pressing `Enter` expands a panel.
- A labeled `Open` action opens the service in a new tab; `Shift+Enter` opens the focused service directly.
- `/` focuses search; arrows and `h/j/k/l` move focus; `Esc` closes details or clears search; `?` opens help; number keys switch views.
- Local search ranks services, hosts, documentation, runbooks, and actions before an explicit web-search result.

## Visual System

### Canonical Dark Palette

The dark theme maps btop's built-in [`Default_theme`](https://github.com/aristocratos/btop/blob/main/src/btop_theme.cpp#L52-L101) values into named web tokens:

| Token | Web value |
|---|---:|
| Main background | `#000000` |
| Main foreground | `#cccccc` |
| Title | `#eeeeee` |
| Highlight | `#b54040` |
| Inactive | `#404040` |
| Graph text | `#606060` |
| CPU box | `#556d59` |
| Memory box | `#6c6c4b` |
| Network box | `#5c588d` |
| Workload box | `#805252` |
| Divider | `#303030` |
| CPU gradient | `#77ca9b` → `#cbc06c` → `#dc4c4c` |
| Temperature gradient | `#4897d4` → `#5474e8` → `#ff40b6` |
| Download gradient | `#291f75` → `#4f43a3` → `#b0a9de` |
| Upload gradient | `#620665` → `#7d4180` → `#dcafde` |
| Used-memory gradient | `#592b26` → `#d9626d` → `#ff4769` |
| Cached-memory gradient | `#163350` → `#74e6fc` → `#26c5ff` |
| Available-memory gradient | `#4e3f0e` → `#ffd77a` → `#ffb814` |

The canonical dark appearance uses monospace typography, compact spacing, box-drawing-inspired borders, and dot/braille-style Canvas or SVG graphs. It should feel like btop without pretending to be a browser terminal or copying btop's C++ interface.

The light theme is a btop-compatible accessibility variant rather than a literal inversion. Its colors require approval at the mockup gate. `Auto` follows `prefers-color-scheme` while allowing a local override.

State never relies on color alone. Text, icon shape, pattern, and focus state supplement the palette. Ordinary text and controls target WCAG 2.2 AA. Reduced-motion and high-contrast modes are supported. Service and weather icons use restrained monochrome or duotone theme colors rather than unrelated vendor palettes.

## Application Architecture

```text
Browser
  ├─ React/Vite interface
  ├─ REST: initial state, configuration, and history
  └─ SSE: normalized live updates
          │
          ▼
Fastify backend / integration gateway
  ├─ allowlisted adapters
  ├─ in-memory cache
  ├─ freshness and severity normalization
  ├─ circuit breakers and timeouts
  └─ no persistent application database
          │
          ├─ Prometheus / Alertmanager
          ├─ k3s and future OKD APIs
          ├─ Argo CD API
          ├─ Proxmox and PBS APIs
          ├─ UniFi API
          ├─ temporary Glances sources
          ├─ allowlisted service probes
          └─ Open-Meteo weather and air-quality APIs
```

The implementation uses TypeScript, React, Vite, Fastify, REST, Server-Sent Events, CSS Grid, and Canvas or SVG graphs. It is one repository and one deployable container image. Prometheus retains historical metrics; the backend caches only current normalized state. SSE fits the read-only server-to-browser traffic and avoids unnecessary bidirectional connections.

The application remains stateless, so replicas and cluster copies require no database synchronization.

## Data-Source Ownership

| Domain | System of record | Dashboard use |
|---|---|---|
| Host CPU, memory, network, and history | Prometheus exporters | Live summaries and selectable history |
| Host temperatures | Prometheus exporter or temporary Glances adapter | Overview and compute detail |
| Proxmox guests | Read-only Proxmox API | VM/container counts and host state |
| k3s/OKD cluster state | Prometheus plus least-privilege cluster API | Node, workload, and cluster health |
| Argo CD synchronization | Read-only Argo CD API | Degraded and out-of-sync summaries |
| Alerts | Alertmanager plus normalized adapter alerts | Read-only aggregate |
| Grafana | Health API and link | Reachability; Grafana retains historical analysis |
| PBS | Read-only PBS API | Reachability, datastore, backup freshness, and failures |
| UniFi | Supported read-only API | Controller health, network metrics, and speed-test history |
| USP-PDU-PRO | Supported read-only capability if verified | Total and labeled per-outlet measured wattage |
| Weather/AQI | Open-Meteo | Current Portland utility data |
| Service state | Backend allowlisted probes | Server-side reachability |

The browser never receives upstream credentials or contacts privileged infrastructure APIs directly. Glances is a migration bridge, not the target telemetry platform. No exporter is installed on a hypervisor or infrastructure host without an explicit least-privilege review.

## Reachability and State Semantics

### Checks

| Target | Check |
|---|---|
| Argo CD | HTTPS health endpoint |
| Grafana | HTTPS health/database endpoint |
| UniFi | Authenticated read-only API request |
| Proxmox hosts | Authenticated node-status API request |
| Nexus | HTTPS service-status endpoint |
| PBS | Authenticated server/datastore request |
| Documentation | HTTPS 2xx response |
| k3s/OKD API | Readiness endpoint |
| OKD console | HTTPS 2xx/3xx response |
| Internet | DNS resolution plus HTTPS request |

Checks run every 15 seconds. Two consecutive failures mark a service degraded; two consecutive successes mark it recovered. The interface explicitly labels these as server-side checks.

Latency targets are the gateway at `192.168.40.1`, public resolvers `1.1.1.1` and `8.8.8.8`, k3s ingress at `192.168.40.30`, future OKD API at `192.168.40.29`, and future OKD ingress at `192.168.40.31`. TCP or HTTPS timing substitutes when ICMP is unavailable. Planned targets are not errors before activation.

### Freshness

- Current data appears normally.
- Unreachable sources retain a muted last value labeled `STALE` with its age.
- A source with no successful sample displays `NO DATA`.
- Planned inactive systems display `NOT PROVISIONED`.
- Unsupported optional integrations display `NOT SUPPORTED`.

### Severity

- `OK`: healthy.
- `INFO`: noteworthy but unimpaired.
- `WARN`: degraded or approaching a limit.
- `CRIT`: unavailable, failed, or beyond a critical threshold.

Source-provided severity wins where available. Dashboard thresholds are versioned in Git and cannot be changed per browser. Initial numeric thresholds must be documented and approved with the detailed data-source map rather than silently invented during implementation.

## Security Architecture

- `home.lab.seandre.dev` remains private and protected by the existing LAN/VPN boundary.
- v1 adds no application login.
- Administrative access remains limited to approved admin devices.
- A future `portal.lab.seandre.dev` uses a reduced server-side profile and separate network policy for household access.
- Integrations use distinct read-only identities wherever supported.
- Secrets begin as manually managed Kubernetes Secrets and migrate to the planned encrypted-secret workflow.
- Plaintext credentials never enter Git, the image, browser responses, or logs.
- Upstream URLs are allowlisted; the backend is not a generic proxy and cannot fetch a user-supplied URL.
- Adapters enforce timeouts, response-size limits, schema validation, and circuit breaking.
- The pod runs non-root, drops capabilities, uses seccomp and a read-only root filesystem, and receives only required RBAC and egress.
- Content Security Policy, secure response headers, same-origin APIs, dependency scanning, image scanning, and an SBOM are required.
- v1 exposes no infrastructure mutation endpoints.

## Configuration and Customization

Git owns views, default layouts, services, links, data-source definitions without secrets, probes, severity rules, thresholds, feature flags, and configuration profiles.

Browser-local storage owns panel arrangement and size overrides, appearance preference, graph window, and dismissible hints. The interface supports reset to Git defaults and JSON export/import. Local changes cannot modify health thresholds or server-side integrations.

## Build and Deployment

### CI and Image

- GitHub Actions runs linting, type checking, tests, and frontend accessibility checks.
- CI builds the image once, scans it, attaches SBOM/provenance metadata, and publishes it privately to GHCR.
- Kubernetes deploys an immutable digest rather than a mutable tag.
- A scoped image-pull Secret provides private-registry access.

### k3s v1

- Run two stateless replicas with startup, readiness, and liveness probes.
- Spread replicas across eligible k3s nodes when capacity permits.
- Use a PodDisruptionBudget and rolling updates.
- Preserve the current Homepage manifests until acceptance.
- Introduce the custom app on a preview hostname first.
- Cut over `home.lab.seandre.dev` only after security, responsive, integration, and rollback gates pass.
- Rollback restores the current Homepage service and ingress without first deleting its configuration.

### Future OKD

- Reuse the same image digest and common Kubernetes base.
- Use cluster overlays for ingress or Route, service account, network policy, pull secret, and platform security constraints.
- Run both stateless copies before changing primary ownership.
- Exercise manual traffic switching and rollback before automatic failover work.

## Availability Roadmap

### Phase 1: k3s Primary

The custom app runs on k3s with multiple replicas, probes, and spread constraints. The current Homepage deployment remains its rollback target.

### Phase 2: Dual Deployment and Manual Switching

The same immutable application runs on k3s and OKD. Each copy has an independently testable hostname. The stable homepage name changes only after manual health verification.

### Phase 3: Automatic Failover

The eventual target is recovery within 30 seconds for any dependency failure that makes the active homepage unreachable. The current single `bastion-01` HAProxy/DNS dependency cannot meet that objective.

Automatic failover requires:

- a stable endpoint independent of both application clusters;
- at least two health-checking/load-balancing instances on separate failure domains;
- a VIP or equivalent mechanism that avoids DNS-cache-dependent switching;
- redundant internal DNS if DNS failure remains inside the promised envelope;
- checks that cover the application, ingress, and cluster; and
- tested load-balancer, DNS, physical-host, power, recovery, rollback, and split-brain behavior.

Do not claim 30-second automatic failover until end-to-end failure drills prove it.

## Delivery Gates

1. Approve this architecture and the detailed data-source and credential map.
2. Approve high-fidelity desktop and mobile mockups with representative fake data, including dark/light/auto behavior.
3. Approve the responsive shell, views, navigation, layout editing, and keyboard controls.
4. Add and verify weather and service launching.
5. Add and verify read-only telemetry, alerts, reachability, latency, and optional PDU integration.
6. Complete security review, CI/container pipeline, k3s preview, cutover, and rollback drill.
7. After OKD exists, add its overlay and perform a manual failover exercise.
8. Design and test automatic failover as a separate infrastructure project.

## v1 Acceptance Criteria

v1 is accepted when:

- it runs privately on k3s under GitOps control;
- all agreed service links and utilities remain available;
- live, stale, no-data, not-provisioned, and unsupported states are accurate and distinct;
- CPU and network graphs reproduce btop's dot style while remaining responsive and web-native;
- both Proxmox hosts use the matching summary hierarchy;
- alerts and integrations are read-only;
- no integration credential appears in the browser, image, Git history, or logs;
- desktop, tablet, and mobile pass approved visual and interaction checks;
- keyboard operation, focus visibility, reduced motion, and ordinary control/text contrast pass the accessibility gate;
- the private GHCR image is reproducibly built, scanned, SBOM-attached, and deployed by digest; and
- a tested procedure restores the current Homepage deployment.

OKD operation, automatic failover, household access, and smart-home integration are not v1 acceptance requirements.

## v2 Direction

- Add a reduced household profile at `portal.lab.seandre.dev` with network-enforced access.
- Add an Environment view for CO2, indoor temperature, air quality, Nest, and Coway Airmega state.
- Evaluate Home Assistant as the integration and authorization boundary instead of embedding multiple vendor credentials.
- Separate read adapters from explicitly authorized write actions.
- Require confirmation, auditability, bounded scopes, and safe failure behavior before enabling device control.

## Attribution

The visual system is inspired by btop and uses its published default color definitions. btop is distributed under the [Apache License 2.0](https://github.com/aristocratos/btop/blob/main/LICENSE). Retain this attribution and upstream link. If source code is later copied or adapted, preserve all applicable license and notice obligations; this architecture calls for an independent web implementation rather than a source port.
