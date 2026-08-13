# Homepage Data Sources and Credential Map

Status: direct OKD source contract updated 2026-08-11. Implementation is
complete in source, but rollout remains blocked on the continuous 30-minute
DNS/API preflight and genuine 24-hour preview soak in
[Homepage Observability Expansion](../operations/homepage-observability.md#okd-direct-telemetry-rollout).

This map defines the server-side integration boundary for the custom Homepage.
The browser receives only normalized, allowlisted contracts from the backend. It
never receives upstream credentials and never contacts privileged infrastructure
APIs directly. All endpoints below exclude credentials and are either verified
repository values, architecture-approved planned values, or explicitly marked
unresolved.

## Contract map

| Integration | Owner | Endpoint without credentials | Protocol | Read-only permission | Secret name/key placeholders | Poll / timeout | Cache and freshness | Redaction | Fixture status |
|---|---|---|---|---|---|---|---|---|---|
| Prometheus | Homelab monitoring | `http://kube-prometheus-stack-prometheus.monitoring.svc:9090` | HTTP REST; fixed PromQL catalog | Four Git-owned aggregate capacity/usage queries plus six fixed PDU queries (total and five exact host outlets); no admin, config, reload, write, arbitrary metric, or browser-supplied PromQL API | None | 5s loop / 3s | Cluster values stale after 45s; PDU values stale after 75s | Return normalized scalars and source state only; never return PDU name/outlet labels | `IMPLEMENTED PREVIEW`; expanded OKD outlet mapping requires the current 24-hour candidate soak |
| Alertmanager | Homelab monitoring | `http://kube-prometheus-stack-alertmanager.monitoring.svc:9093` | HTTP REST | Read active alerts only; no silence, acknowledgement, delete, or task APIs | None | 5s loop / 3s | Last good alert set becomes stale after 45s | Allowlist name, severity, start time, summary/description; remove receivers and internal labels | `IMPLEMENTED PREVIEW`: direct active-alert read only |
| k3s API | Homelab cluster owner | `https://kubernetes.default.svc` | Kubernetes HTTPS API | Dedicated ServiceAccount with least-privilege get/list/watch for the approved node, workload, namespace, condition, resource-summary, and event fields needed by the Compute and Kubernetes views; no create/update/patch/delete/exec/port-forward | In-cluster ServiceAccount token; Kubernetes-mounted, not a Git Secret | 15s / 3s | Cache normalized cluster state; stale on API failure | Never expose token, headers, raw objects, annotations, or Secret data | `READY`: healthy, degraded, forbidden, empty, stale fixtures required |
| OKD API | OKD platform owner | `https://api.okd.lab.seandre.dev:6443` (`192.168.40.29`) | Kubernetes HTTPS API with public-trust TLS verification | `get/list` only on nodes, node metrics, Deployments, StatefulSets, DaemonSets, and ClusterOperators; no Secrets, ConfigMaps, pod logs/exec, or mutation | required `homepage/homepage-okd-api` / `server`, `token`; no CA key because the endpoint uses public trust | no faster than 15s / 3s | Retain last good; two failures open the circuit, two successes recover; configured/no sample is `NO DATA`/`WARN` | Never expose token, headers, condition messages, raw objects, annotations, or credential-shaped fields; schema v5 emits normalized operators only | `IMPLEMENTED`; deployment remains blocked on the 30-minute preflight and genuine 24-hour preview soak |
| OKD Thanos query API | OKD platform owner | `https://thanos-querier-openshift-monitoring.apps.okd.lab.seandre.dev` | HTTPS REST with public-trust TLS verification; sixteen fixed PromQL expressions | Bound to built-in `cluster-monitoring-metrics-api` Role. Its `get/create/update` verbs apply only to named virtual `prometheuses/api` subresource `k8s`; actual Prometheus objects and all arbitrary cluster resources remain denied | Reuses `homepage/homepage-okd-api` / `token` | no faster than 15s / 3s | Retain last good; two failures open the circuit and two successes recover | Emit only normalized load/core, `/sysroot` XFS, `nvme0n1` I/O, latest-pair `eno1` RX/TX rates and counters, swap, hottest hwmon temperature, uptime, and kubelet container values for each allowlisted node. Never emit query text, token, headers, raw labels/objects, or error bodies. | `IMPLEMENTED CANDIDATE`; every expression returned exactly three live nodes before preview. CPU clock and VM inventory remain unsupported because no valid approved gauge exists. |
| Argo CD | Homelab GitOps owner | `https://argocd.lab.seandre.dev/api/v1/applications` | HTTPS REST | Read approved Application health/sync fields plus project/name, operation phase, revision, and safe status message; no sync, rollback, terminate, or repository operations | `homepage/homepage-argocd-readonly` / `server`, `token` | 5s loop / 3s | Cache last good application summary; stale on failure | Allowlist app name, health, sync, revision, operation phase, and safe message; remove repository details and credentials | `IMPLEMENTED PREVIEW`: requires Gate C response review |
| Proxmox `pve-01` | Virtualization owner | `https://pve-01.lab.seandre.dev:8006/api2/json` | HTTPS REST | Read-only node status, aggregate running/stopped VM and container counts, uptime, memory, swap, and aggregate storage; no task, VM, storage, or configuration writes | `homepage-proxmox-pve01` / `server`, `token-id`, `token-secret`; `ca` only if a private CA is introduced | 15s / 5s | Last value labeled `STALE` with age; no sample is `NO DATA` | Remove token, cookies, raw error bodies, guest names, IDs, configuration, task data, and all unapproved fields | `VERIFIED 2026-07-19`: live read-only request returned 200; adapter remains disabled pending enablement |
| Proxmox `pve-02` | Virtualization owner | `https://pve-02.lab.seandre.dev:8006/api2/json` | HTTPS REST | Read-only node status, aggregate running/stopped VM and container counts, uptime, memory, swap, and aggregate storage; no mutation endpoints | `homepage-proxmox-pve02` / `server`, `token-id`, `token-secret` (the endpoint presents a publicly trusted certificate) | 15s / 5s | Last value labeled `STALE` with age; no sample is `NO DATA` | Remove token, cookies, raw error bodies, guest names, IDs, configuration, task data, and all unapproved fields | `VERIFIED 2026-07-19`: node endpoint, public TLS, and live read-only request returned 200; adapter remains disabled pending enablement |
| PBS | Backup owner | `https://pbs-01.lab.seandre.dev:8007/api2/json` | HTTPS REST with supplied self-signed public certificate | Read aggregate datastore usage, snapshot timestamps, and verification state for `pve02-backups`; no backup, prune, restore, verify, task, configuration, or content-read operations | `homepage-pbs-readonly` / `server`, `token-id`, `token-secret`, `ca` | 5s loop / 5s | Cache backup state; stale after timeout; no sample is `NO DATA` | Remove tokens, CA material, snapshot owner/type/ID, task details, raw errors, and unapproved datastore fields | `IMPLEMENTED PREVIEW`: CA stays mounted read-only and is used per request |
| UniFi | Network owner | `https://api.ui.com/v1` (official Site Manager API) | HTTPS REST, GET only | Read Site Manager host connectivity and existing 5-minute ISP metrics; no local controller access, speed-test start, network/device/client mutation, or arbitrary API path | `homepage-unifi-readonly` / `server`, `token` | 5s loop / 5s | Cache last known state and ISP metric; stale on failure | Allowlist controller connection state plus metric timestamp, download/upload, and latency; remove token, host/site/device IDs, IPs, client data, raw responses, and trace IDs | `IMPLEMENTED PREVIEW`: requires Gate C response review |
| Glances bridge | Telemetry owner | **Verified current bridge:** `http://192.168.40.20:61208`, `.25:61208`, `.33:61208`; API path `/api/4/all` | HTTP REST | Read only approved CPU/per-core, memory, swap, sensors, filesystem, disk, network, and uptime fields; temporary bridge while node_exporter is added | No credential currently documented; `homepage-glances` / `hosts` if authentication is added | 5s / 3s | Cache normalized values; stale after timeout; no sample is `NO DATA` | Raw Glances shapes never leave backend; remove host headers, unapproved sensors, and error bodies | `IMPLEMENTED PREVIEW` for `pve-01`/`pve-02` |
| Service probes | Homelab operations owner | Allowlisted targets: Argo CD, Grafana, UniFi, Nexus, PBS, docs, k3s/OKD APIs, OKD console, and Internet; exact endpoints inherit each source's approved URL | HTTPS/HTTP, DNS, TCP timing as appropriate | Network reachability and latency only; no arbitrary URL or port input from browser | `homepage-service-probes` / `targets` only; credentials come from the owning adapter, never probe input | 15s; 2 failures degrade / 2 successes recover / 3s per check | Keep last result with `STALE`; planned inactive OKD targets are not errors | Return target label, status, latency, and timestamp only; no response body or headers | `READY`: 2-failure/2-success, timeout, planned, and recovery fixtures required |
| WeatherAPI + NWS + AirNow chain | Utility/weather owner | WeatherAPI forecast endpoint; NWS point, station observation, and hourly forecast APIs; AirNow current observation and monitoring-site APIs; Open-Meteo weather, air-quality, history, map-grid, and point-forecast APIs; approved Portland `97209` coordinates: `45.527412, -122.686270` | HTTPS REST | WeatherAPI current conditions and astronomy; NWS observed conditions with hourly-forecast fallback; AirNow U.S. AQI and monitoring-site markers; Open-Meteo PM2.5, PM10, final provider fallback, history, bounded map model samples, and selected-point AQI forecast | `homepage-weatherapi-readonly` / `api-key`; `homepage-airnow-readonly` / `api-key` (optional; absence selects Open-Meteo AQI fallback and hides station markers); Open-Meteo requires no credential | Conditions and astronomy 10m / 5s; AQI 30m / 5s; NWS discovery 24h; history refresh aligns to the next five-minute boundary; map refresh is debounced 450ms and cached 5m | Retain the last successful astronomy values across provider failures; conditions stale after 35m and AQI after 75m; history windows are `1h`, `3h`, `6h`, `24h`, `7d`, and `30d`, with at most 360 normalized points per graph. The map accepts at most an 8° viewport and samples a fixed 6×6 model grid. The server computes trailing 24-hour PM averages and EPA truncation before returning particulate history. AQI and PM colors use EPA category breakpoints; temperature, humidity, precipitation, and wind are explicitly labeled visual scales rather than hazard criteria. | Keys remain runtime-only; the browser receives normalized map points and never the AirNow key. Request logs omit query strings and coordinates. The browser contacts only the Homepage API plus visible OpenStreetMap raster tiles; it does not prefetch or cache tiles for offline use. | `IMPLEMENTED`: current provider chain, outdoor trend history, and draggable AQI heat/station map with click forecast |
| UniFi PDU Pro power | Network owner | `https://unifi.local` via the in-cluster UnPoller exporter; controller IP is only a pod-local host alias | HTTPS local UniFi API with a Site Manager-generated API key; Prometheus reads a fixed exporter metric | UnPoller may read the controller only; Prometheus retains `unpoller_device_outlet_outlet_power` plus scrape health; Homepage issues only six fixed queries after exact-label validation: total plus `pve-01`, `pve-02`, and three OKD nodes. No outlet control, arbitrary API path, client/device response, or browser PromQL exists. | `monitoring/unpoller-unifi-readonly` / complete `up.conf` with `api_key`; never committed | UnPoller 30s / Prometheus 30s / Homepage 5s | Last full PDU set is stale after 75s; a missing required outlet is `NO DATA`/`INFO` and does not affect global health | Schema v5 exposes only total watts and normalized host watts. It excludes credentials, controller/device IDs, names, outlet labels, query text, raw metric labels, and API responses. | `IMPLEMENTED CANDIDATE`; all five exact host series verified live before preview |

## Boundary and behavior rules

- Every row is server-only. The browser calls the custom backend's normalized REST
  and SSE endpoints, never an upstream endpoint.
- The one public-data exception is the interactive map's browser-loaded
  OpenStreetMap basemap. It uses the standard tile URL, visible attribution,
  normal browser caching, and visible-viewport requests only. AQI providers and
  all credential-bearing requests remain server-side.
- The backend uses a fixed, Git-owned allowlist. A browser request cannot supply
  an arbitrary URL, query, host, port, PromQL expression, Kubernetes resource, or
  Proxmox path.
- `NOT PROVISIONED` is reserved for planned systems that are intentionally
  inactive. The enabled OKD API now reports `NO DATA`/`WARN` until its first
  successful sample. `NOT SUPPORTED` remains available
  for optional integrations without a verified supported interface; the PDU
  no longer uses that state because its local UnPoller path passed preflight.
- Poll intervals and timeouts above are proposed implementation defaults where
  the architecture did not specify an exact value. Owner approval is required
  before adapter work turns them into contracts.
- Secret names and keys are placeholders only. No secret value, kubeconfig,
  bearer token, API token, or private certificate belongs in this document or Git.

## Approval block

HP-002 must be approved before integration implementation begins. Fixture-based
UI work may proceed after approval as described by the build plan.

| Review item | Owner decision |
|---|---|
| Source endpoints, especially monitoring Service names, Argo CD API path, PBS, and UniFi | **Approved with UniFi endpoint/API verification still blocked** |
| Read-only identities, Secret names/keys, and field allowlists | **Approved; credentials must be provisioned later without entering Git** |
| Polling, timeout, cache, and freshness rules | **Approved** |
| Browser/server boundary and redaction rules | **Approved** |
| Fixture readiness and `NOT PROVISIONED` / `NOT SUPPORTED` behavior | **Approved** |

Owner: `SEAN`  Date: `2026-07-19`

Notes / required changes:

______________________________________________________________________________

______________________________________________________________________________
