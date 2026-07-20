# Homepage Data Sources and Credential Map

Status: live-source contract updated 2026-07-20. Preview-only enablement is
implemented; host node_exporter installation still requires the operator steps
in [Homepage Observability Expansion](../operations/homepage-observability.md).

This map defines the server-side integration boundary for the custom Homepage.
The browser receives only normalized, allowlisted contracts from the backend. It
never receives upstream credentials and never contacts privileged infrastructure
APIs directly. All endpoints below exclude credentials and are either verified
repository values, architecture-approved planned values, or explicitly marked
unresolved.

## Contract map

| Integration | Owner | Endpoint without credentials | Protocol | Read-only permission | Secret name/key placeholders | Poll / timeout | Cache and freshness | Redaction | Fixture status |
|---|---|---|---|---|---|---|---|---|---|
| Prometheus | Homelab monitoring | `http://kube-prometheus-stack-prometheus.monitoring.svc:9090` | HTTP REST; fixed PromQL catalog | Four Git-owned aggregate capacity/usage queries plus, after the PDU preflight gate, three fixed outlet-power queries; no admin, config, reload, write, arbitrary metric, or browser-supplied PromQL API | None | 5s loop / 3s | Cluster values stale after 45s; PDU values stale after 75s | Return normalized scalars and source state only; never return PDU name/outlet labels | `IMPLEMENTED PREVIEW`; PDU mapping remains disabled until its validation gate passes |
| Alertmanager | Homelab monitoring | `http://kube-prometheus-stack-alertmanager.monitoring.svc:9093` | HTTP REST | Read active alerts only; no silence, acknowledgement, delete, or task APIs | None | 5s loop / 3s | Last good alert set becomes stale after 45s | Allowlist name, severity, start time, summary/description; remove receivers and internal labels | `IMPLEMENTED PREVIEW`: direct active-alert read only |
| k3s API | Homelab cluster owner | `https://kubernetes.default.svc` | Kubernetes HTTPS API | Dedicated ServiceAccount with least-privilege get/list/watch for the approved node, workload, namespace, condition, resource-summary, and event fields needed by the Compute and Kubernetes views; no create/update/patch/delete/exec/port-forward | In-cluster ServiceAccount token; Kubernetes-mounted, not a Git Secret | 15s / 3s | Cache normalized cluster state; stale on API failure | Never expose token, headers, raw objects, annotations, or Secret data | `READY`: healthy, degraded, forbidden, empty, stale fixtures required |
| Future OKD API | OKD platform owner | **Planned:** `https://api.okd.lab.seandre.dev` (`192.168.40.29` reserved; inactive until OKD is provisioned) | Kubernetes HTTPS API | Dedicated read-only identity equivalent to k3s, scoped to approved cluster summaries | `homepage-okd-api` / `server`, `ca`, `token` | 15s / 3s | Inactive before provisioning is `NOT PROVISIONED`; stale only after activation and a prior sample | Never expose token, CA private material, headers, raw objects, or Secret data | `READY`: `NOT PROVISIONED` plus healthy/error fixtures |
| Argo CD | Homelab GitOps owner | `https://argocd.lab.seandre.dev/api/v1/applications` | HTTPS REST | Read approved Application health/sync fields plus project/name, operation phase, revision, and safe status message; no sync, rollback, terminate, or repository operations | `homepage/homepage-argocd-readonly` / `server`, `token` | 5s loop / 3s | Cache last good application summary; stale on failure | Allowlist app name, health, sync, revision, operation phase, and safe message; remove repository details and credentials | `IMPLEMENTED PREVIEW`: requires Gate C response review |
| Proxmox `pve-01` | Virtualization owner | `https://pve-01.lab.seandre.dev:8006/api2/json` | HTTPS REST | Read-only node status, aggregate running/stopped VM and container counts, uptime, memory, swap, and aggregate storage; no task, VM, storage, or configuration writes | `homepage-proxmox-pve01` / `server`, `token-id`, `token-secret`; `ca` only if a private CA is introduced | 15s / 5s | Last value labeled `STALE` with age; no sample is `NO DATA` | Remove token, cookies, raw error bodies, guest names, IDs, configuration, task data, and all unapproved fields | `VERIFIED 2026-07-19`: live read-only request returned 200; adapter remains disabled pending enablement |
| Proxmox `pve-02` | Virtualization owner | `https://pve-02.lab.seandre.dev:8006/api2/json` | HTTPS REST | Read-only node status, aggregate running/stopped VM and container counts, uptime, memory, swap, and aggregate storage; no mutation endpoints | `homepage-proxmox-pve02` / `server`, `token-id`, `token-secret` (the endpoint presents a publicly trusted certificate) | 15s / 5s | Last value labeled `STALE` with age; no sample is `NO DATA` | Remove token, cookies, raw error bodies, guest names, IDs, configuration, task data, and all unapproved fields | `VERIFIED 2026-07-19`: node endpoint, public TLS, and live read-only request returned 200; adapter remains disabled pending enablement |
| PBS | Backup owner | `https://pbs-01.lab.seandre.dev:8007/api2/json` | HTTPS REST with supplied self-signed public certificate | Read aggregate datastore usage, snapshot timestamps, and verification state for `pve02-backups`; no backup, prune, restore, verify, task, configuration, or content-read operations | `homepage-pbs-readonly` / `server`, `token-id`, `token-secret`, `ca` | 5s loop / 5s | Cache backup state; stale after timeout; no sample is `NO DATA` | Remove tokens, CA material, snapshot owner/type/ID, task details, raw errors, and unapproved datastore fields | `IMPLEMENTED PREVIEW`: CA stays mounted read-only and is used per request |
| UniFi | Network owner | `https://api.ui.com/v1` (official Site Manager API) | HTTPS REST, GET only | Read Site Manager host connectivity and existing 5-minute ISP metrics; no local controller access, speed-test start, network/device/client mutation, or arbitrary API path | `homepage-unifi-readonly` / `server`, `token` | 5s loop / 5s | Cache last known state and ISP metric; stale on failure | Allowlist controller connection state plus metric timestamp, download/upload, and latency; remove token, host/site/device IDs, IPs, client data, raw responses, and trace IDs | `IMPLEMENTED PREVIEW`: requires Gate C response review |
| Glances bridge | Telemetry owner | **Verified current bridge:** `http://192.168.40.20:61208`, `.25:61208`, `.33:61208`; API path `/api/4/all` | HTTP REST | Read only approved CPU/per-core, memory, swap, sensors, filesystem, disk, network, and uptime fields; temporary bridge while node_exporter is added | No credential currently documented; `homepage-glances` / `hosts` if authentication is added | 5s / 3s | Cache normalized values; stale after timeout; no sample is `NO DATA` | Raw Glances shapes never leave backend; remove host headers, unapproved sensors, and error bodies | `IMPLEMENTED PREVIEW` for `pve-01`/`pve-02` |
| Service probes | Homelab operations owner | Allowlisted targets: Argo CD, Grafana, UniFi, Nexus, PBS, docs, k3s/OKD APIs, OKD console, and Internet; exact endpoints inherit each source's approved URL | HTTPS/HTTP, DNS, TCP timing as appropriate | Network reachability and latency only; no arbitrary URL or port input from browser | `homepage-service-probes` / `targets` only; credentials come from the owning adapter, never probe input | 15s; 2 failures degrade / 2 successes recover / 3s per check | Keep last result with `STALE`; planned inactive OKD targets are not errors | Return target label, status, latency, and timestamp only; no response body or headers | `READY`: 2-failure/2-success, timeout, planned, and recovery fixtures required |
| Open-Meteo | Utility/weather owner | `https://api.open-meteo.com/v1/forecast` and `https://air-quality-api.open-meteo.com/v1/air-quality`; approved Portland `97209` coordinates: `45.527412, -122.686270` | HTTPS REST | Public read-only forecast/current weather, sunrise/sunset, U.S. AQI, PM2.5, PM10 | None | 15m / 5s | Cache successful weather/AQI data; stale with age on failure; partial AQI is allowed | Normalize units/time; discard raw query/response details and unrelated fields | `READY`: current, partial, stale, malformed, and rate-limit fixtures required |
| UniFi PDU Pro power | Network owner | `https://unifi.local` via the in-cluster UnPoller exporter; controller IP is only a pod-local host alias | HTTPS local UniFi API with a Site Manager-generated API key; Prometheus reads a fixed exporter metric | UnPoller may read the controller only; Prometheus retains `unpoller_device_outlet_outlet_power` plus scrape health; Homepage may issue only the three fixed aggregate queries after label validation. No outlet control, arbitrary API path, client/device response, or browser PromQL exists. | `monitoring/unpoller-unifi-readonly` / complete `up.conf` with `api_key`; never committed | UnPoller 30s / Prometheus 30s / Homepage 5s | `NOT_SUPPORTED` until preflight; then last full PDU set is stale after 75s; a missing outlet is `NO DATA` | Public bootstrap exposes only total watts, per-host watts, and freshness. It excludes credentials, controller/device IDs, names, outlet labels, raw metric labels, and API responses. | `STAGED`: manifests and strict TLS pin are committed; API-key access follows the issuing UI account and must be reviewed before activation |

## Boundary and behavior rules

- Every row is server-only. The browser calls the custom backend's normalized REST
  and SSE endpoints, never an upstream endpoint.
- The backend uses a fixed, Git-owned allowlist. A browser request cannot supply
  an arbitrary URL, query, host, port, PromQL expression, Kubernetes resource, or
  Proxmox path.
- `NOT PROVISIONED` is reserved for planned systems that are intentionally
  inactive, especially the future OKD API. `NOT SUPPORTED` is reserved for
  optional integrations without a verified supported interface, especially
  USP-PDU-PRO.
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
