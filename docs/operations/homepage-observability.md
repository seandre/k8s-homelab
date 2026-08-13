# Homepage Observability Expansion

Status: OKD direct telemetry is implemented in source on 2026-08-11. The
continuous preflight passed on 2026-08-12. The current preview candidate began
its mandatory 24-hour soak at `2026-08-13T05:03:26Z`; production promotion
remains blocked through at least `2026-08-14T05:03:26Z`. The
earlier observability expansion was implemented in the preview GitOps path on
2026-07-20. The UniFi PDU
preflight passed and its mapping is enabled at Git revision `c3d8968`; the
owner-approved shortened Gate D technical soak passed at
`2026-07-20T21:37:34Z`. Production Homepage traffic has not changed. Host
exporter installation remains an operator-run prerequisite for the separate
host-exporter path.

## Implemented cluster components

The existing `kube-prometheus-stack` remains the sole monitoring stack. Its
Prometheus StatefulSet is configured for 30-day retention on a 50 GiB
`local-path` PVC. `local-path` is node-local: it survives a pod replacement,
but is not a backup or a host-failure solution.

`homelab-monitoring-config` owns the Git-managed `ScrapeConfig`, but keeps its
target list empty until all exporters and their narrow firewall rules have
passed verification. This prevents a staged rollout from emitting a known false
`TargetDown` alert. When activated, it declares these fixed node_exporter
targets every 15 seconds:

| Host | Target | Role |
|---|---|---|
| `pve-01` | `192.168.40.20:9100` | Proxmox |
| `pve-02` | `192.168.40.25:9100` | Proxmox |
| `pbs-01` | `192.168.40.34:9100` | backup |
| `bastion-01` | `192.168.40.33:9100` | infrastructure |

It is safe for these targets to be temporarily `DOWN` before installation;
Prometheus and Homepage stay healthy and render `NO DATA` rather than inferred
values.

## Host node_exporter prerequisite

Run the following on each listed Debian-based host only after confirming its
owner and firewall policy. Do not expose port 9100 to the public network.

```bash
sudo apt-get update
sudo apt-get install -y prometheus-node-exporter
sudo systemctl enable --now prometheus-node-exporter
sudo systemctl status prometheus-node-exporter --no-pager
```

Restrict TCP/9100 to the k3s Pod CIDR `10.42.0.0/16` at the host firewall. If
the host uses UFW, the narrow rule is:

```bash
sudo ufw allow from 10.42.0.0/16 to any port 9100 proto tcp
```

For another firewall manager, implement the equivalent single source CIDR and
port. Do not add `0.0.0.0/0`, a broad Servers-VLAN rule, or a management UI
exception. Verify locally before exposing it to Prometheus:

```bash
curl --fail --silent http://127.0.0.1:9100/metrics | head
ss -lntp | rg ':9100'
```

Then, after Argo CD has reconciled this repository change, verify target health
without copying metric payloads into tickets:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
# In a second terminal:
curl --get --data-urlencode 'query=up{job="homepage-host-exporters"}' \
  http://127.0.0.1:9090/api/v1/query
```

Every target should report `1`. A `0` means the exporter, route, or narrow
firewall rule needs correction; do not weaken the rule to diagnose it. Then
replace the empty `staticConfigs` list in
`homepage-host-exporters-scrapeconfig.yaml` with the reviewed target catalog
and let Argo CD reconcile it.

## UniFi PDU Pro power telemetry

The monitoring configuration also declares one hardened `unpoller` Deployment,
Service, ServiceMonitor, and NetworkPolicy in `monitoring`. It pins
`ghcr.io/unpoller/unpoller:v3.3.1` to
`sha256:9dcccdc931a6830735f6978caf8cd67699b0dc33e37cf9ef4638611791c4df62`.
The pod has no service-account token, runs with a read-only filesystem and
restricted capabilities, and can accept TCP/9130 only from Prometheus. Its only
egress is TCP/443 to the UDM Pro at `192.168.40.1`.

`unifi.local` is a pod-local host alias for that IP. TLS verification remains
on: the Git-owned ConfigMap contains the public controller certificate whose
SHA-256 fingerprint is
`B1:85:35:85:E2:69:30:D9:2D:5B:AA:95:F0:6B:12:F4:2E:3B:01:91:1B:C4:62:76:95:22:89:89:DD:C8:48:41`.
UnPoller uses it both as `SSL_CERT_FILE` and as `ssl_cert_paths`; there is no
insecure-TLS fallback. A certificate mismatch prevents a successful exporter
rollout and must be investigated, never bypassed.

### Prepare the controller and Secret

In UniFi Site Manager, open **Settings → API Keys** and create a new API key
for this exporter. Store it only in the password manager: it is displayed once.
The API key is tied to the UI account that creates it, so review that account's
access before continuing; it is not a standalone Viewer identity. Do not reuse
the separate Homepage Site Manager token.

Name the five mapped PDU outlets exactly `pve-01`, `pve-02`, `okd-cp-01`,
`okd-cp-02`, and `okd-cp-03`; capitalization and hyphenation are part of the
telemetry contract. Homepage never controls these outlets.

Create `monitoring/unpoller-unifi-readonly` manually from a protected local
file. It must contain one key named `up.conf`; this Secret is intentionally not
in Git:

```bash
kubectl -n monitoring create secret generic unpoller-unifi-readonly \
  --from-file=up.conf=/secure/operator-only/unpoller-up.conf
```

The protected file contains the complete mounted configuration below. Replace
only the API-key placeholder before creating the Secret; do not paste the key
into a shell history, ticket, or this repository.

```toml
[poller]
debug = false
quiet = true
plugins = []

[prometheus]
disable = false
http_listen = "0.0.0.0:9130"
report_errors = false
dead_ports = false
interval = "30s"

[influxdb]
disable = true

[loki]
disable = true

[datadog]
enable = false

[webserver]
enable = false

[unifi]
dynamic = false

[unifi.defaults]
url = "https://unifi.local"
api_key = "REPLACE_FROM_PASSWORD_MANAGER"
sites = ["all"]
save_sites = false
hash_pii = true
save_ids = false
save_events = false
save_syslog = false
save_alarms = false
save_anomalies = false
save_dpi = false
save_traffic = false
save_rogue = false
verify_ssl = true
ssl_cert_paths = ["/etc/unpoller/tls/unifi-ca.crt"]
```

### Certificate rotation

Before updating the ConfigMap, retrieve the controller certificate from a
trusted LAN/VPN client, compare its fingerprint in the UDM UI or local console,
and only then replace the public PEM and documented fingerprint together:

```bash
openssl s_client -connect 192.168.40.1:443 -servername unifi.local -showcerts </dev/null 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256 -subject -issuer -dates
```

Commit the reviewed ConfigMap change, let Argo CD roll UnPoller, and require a
healthy TLS-verified scrape before continuing. Never set `verify_ssl = false`,
remove `ssl_cert_paths`, or substitute `curl -k` as a rotation procedure.

### Mapping preflight and Homepage activation

Do not enable the PDU mapping until all checks below pass in preview. First
confirm the target is up and that Prometheus retains no UniFi telemetry except
the outlet-power metric and scrape health:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
curl --get --data-urlencode 'query=up{service="unpoller"}' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query={__name__=~"unpoller_.*"}' http://127.0.0.1:9090/api/v1/query
```

The target must be `1`; the second response may contain only
`unpoller_device_outlet_outlet_power`. Then require exactly one PDU `name` label and
one returned series for each required outlet:

```bash
curl --get --data-urlencode 'query=count(count by (name) (unpoller_device_outlet_outlet_power))' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=count by (name) (unpoller_device_outlet_outlet_power{outlet_name="pve-01"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=count by (name) (unpoller_device_outlet_outlet_power{outlet_name="pve-02"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=count by (name) (unpoller_device_outlet_outlet_power{outlet_name="okd-cp-01"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=count by (name) (unpoller_device_outlet_outlet_power{outlet_name="okd-cp-02"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=count by (name) (unpoller_device_outlet_outlet_power{outlet_name="okd-cp-03"})' http://127.0.0.1:9090/api/v1/query
```

Record the one discovered `name` label in
`homepage/src/server/runtime-config.ts` at `pduPower.deviceName`, change only
`pduPower.enabled` to `true`, rebuild the preview image, and commit both values
as one reviewed change. A failed count, an unexpected label, a missing outlet,
or a TLS failure means leave the mapping disabled: Homepage continues to show
`NOT SUPPORTED` and must not map any PDU values to a host.

After deployment, query the six fixed expressions and compare the outlet and
total watts with the UniFi dashboard within one 30-second collection interval:

```bash
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="pve-01"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="pve-02"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="okd-cp-01"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="okd-cp-02"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="okd-cp-03"})' http://127.0.0.1:9090/api/v1/query
```

Only after those results and an API-key/certificate/mapping review may PDU
power be called implemented. Soak preview for one hour with no target failure,
stale PDU value, or false alert. The browser response must contain only the PDU
total and the five host watts; it must not contain the controller, PDU name,
outlet labels, credentials, or raw Prometheus data.

### Activation record — 2026-07-20

The preflight discovered exactly one PDU and exactly one series for each
required `pve-01` and `pve-02` outlet label. The reviewed mapping was enabled at
Git revision `c3d8968` with the device name retained only in Git-owned runtime
configuration. The preview Deployment uses immutable image digest
`sha256:d75558ed538c832d9f51259d022511619e44aac1af5d7c6c059d85ef97297dc5`.

The live path is local and read-only: UnPoller connects to `unifi.local` with
strict certificate verification and the manually managed API-key Secret,
Prometheus retains only `unpoller_device_outlet_outlet_power` plus scrape
health, and Homepage runs six fixed aggregate queries. Bootstrap schema v5
exposes only total watts and the five normalized host watts. It excludes the
API key, controller and device identifiers, PDU name, outlet labels, query
text, and raw Prometheus data.

The replacement one-hour Gate D soak began at `2026-07-20T21:08:23Z`. The owner
accepted a shortened window, which closed at `2026-07-20T21:37:34Z` after the
technical target, freshness, restart, alert, and public-contract checks passed.
This is preview Gate D technical closeout only; it is not production cutover.

## Homepage data boundary

The preview backend samples lightweight Glances graph telemetry on an
independent two-second timer with a 1.5-second request bound. The broader source
refresh remains on a separate six-second timer, so a slow inventory source
cannot block graph samples. It sends a normalized bootstrap/SSE contract to the
browser and reads only fixed, Git-owned endpoints and queries:

- Proxmox: node CPU identity/clock/load, memory, swap, storage, uptime, guest
  totals, plus Glances CPU-core, sensor, filesystem, disk, and network fields.
- k3s: nodes, workload readiness, `metrics.k8s.io` node CPU/memory, and the
  fixed Prometheus cluster-capacity catalog.
- Prometheus: four fixed aggregate capacity/usage queries plus six fixed PDU
  aggregate queries after the preflight gate; no browser PromQL input exists.
- Alertmanager: active alerts only; no silences, acknowledgements, or writes.
- Argo CD, PBS, UniFi, Open-Meteo, and the fixed Argo CD reachability probe,
  using their existing read-only identities where supplied.

Homepage egress to Prometheus and Alertmanager is limited by the preview
NetworkPolicy to their monitoring namespace pods on TCP 9090 and 9093. The
custom ServiceAccount now adds only `get/list/watch` for `metrics.k8s.io`
nodes and pods; it still has no Secret or mutation permission.

The PDU preflight has passed for the preview mapping recorded above. A later
label mismatch, missing required series, or TLS/API failure becomes `NO DATA`
or `INFO` for this optional source and does not degrade host, Kubernetes, or
global health. No command in this runbook enables outlet control, starts a
speed test, changes an alert, or writes to an upstream API.

## Review gates and rollback

Before deploying this revision to preview, perform a new Gate C review of:

1. the 50 GiB local-path placement trade-off;
2. each host-side node_exporter installation and its firewall evidence; and
3. the expanded backend's normalized response, with no credential-shaped text.

The preview image has been deployed and the replacement Gate D checks have been
reviewed. The prior soak did not carry forward because this revision changed
data sources and egress. The owner-approved shortened technical closeout is
recorded above; production cutover remains a separate approval.

Rollback is Git-only: set `pduPower.enabled` to `false` (or revert the PDU
mapping, exporter, and preview Homepage commits), sync through Argo CD, and
retain the stock Homepage. Do not delete the manual controller Secret or the
Prometheus PVC as part of rollback unless intentionally rotating credentials or
discarding retained history.

## OKD direct telemetry rollout

Status: implemented in source and GitOps manifests on 2026-08-11. The
`bastion-01` DNS/API route passed the continuous preflight on 2026-08-12. The
candidate is authorized for preview deployment only and must complete a genuine
24-hour preview soak before production promotion. Do not shorten that window.

### Identity and k3s Secret

Apply `kubernetes/clusters/okd/observability/homepage` with the OKD admin
context. It creates `homepage-observability/homepage-k3s-reader`, its narrow
ClusterRole and binding, a RoleBinding to the built-in
`openshift-monitoring/cluster-monitoring-metrics-api` Role, and the manually
populated service-account token Secret. Run
`scripts/validate-okd-homepage-rbac.sh` against that context. Every positive
and negative check must pass.

The built-in monitoring Role grants `get/create/update` only on the named
virtual `prometheuses/api` subresource `k8s`. OKD uses those verbs to authorize
read-only Prometheus query proxy requests; they do not grant mutation of a
Prometheus custom resource. The validator positively checks the virtual API
verbs and negatively checks create/update/delete against actual
`prometheuses.monitoring.coreos.com`, alongside Secrets, ConfigMaps, pod logs,
exec, watches, and the existing mutation matrix.

Homepage issues eighteen fixed Thanos queries for node load1/load5/load15,
per-logical-core CPU idle-rate conversion, `/sysroot` XFS size/availability,
`nvme0n1` I/O busy time, `eno1` receive/transmit rates and byte totals, swap,
the hottest reported hwmon temperature, uptime, kubelet running plus
created/exited container counts, and running/allocatable pod counts. It polls
no faster than 15 seconds with a three-second bound, retains the last good
result, opens after two failures, and recovers after two successes. Only
allowlisted OKD node names and normalized scalar/array values enter schema v5.
Query text, raw labels, errors, headers,
and token material never enter the browser. CPU clock and VM counts are omitted
from OKD cards because the approved metric inventory contains neither; the
available `node_hwmon_freq_freq_mhz` series is GPU `sclk` and must not be
mislabeled as CPU frequency.

Retrieve the token without printing it into a ticket or committing it. Create
the required k3s Secret through a protected temporary file or approved secret
manager workflow. It has exactly two keys:

```text
server = https://api.okd.lab.seandre.dev:6443
token  = <homepage-k3s-reader token>
```

Do not add a CA key, kubeconfig, username, client certificate, or insecure-TLS
flag. The public certificate chain is the trust source. Both preview and
production require `homepage/homepage-okd-api`; the pod must remain unready if
it is absent.

The persistent token is a documented exception to [OKD's preference for
bounded TokenRequest credentials](https://docs.okd.io/4.20/nodes/pods/nodes-pods-secrets.html)
because this consumer is in a separate cluster with no shared credential
broker. Its exposure lasts until explicit revocation, so
store it only in the password manager and Kubernetes Secret, audit its RBAC,
and rotate it every 90 days.

### Ninety-day token rotation

1. Create a second annotated service-account token Secret for the same ServiceAccount; keep the old token valid.
2. Update only `homepage/homepage-okd-api` with the new token and unchanged approved server.
3. Restart preview, then production, and verify current OKD samples, strict TLS, API permissions, UI state, and response/log redaction in both.
4. Delete the old OKD token Secret only after both Deployments have produced successful samples with the replacement.
5. Record the issue, activation, verification, revocation, and next-due dates without recording either token.

If the new token fails, restore the old k3s Secret while overlap still exists.
If either token may have leaked, revoke it immediately, suspend the adapter if
necessary, and review API audit logs; the ordinary overlap schedule no longer
applies.

### Continuous 30-minute preflight

Start a fresh timer after every failed check or interruption. For 30 continuous
minutes, both `utility-01` and a disposable k3s test pod must resolve the API
and console through normal DNS. Strict-TLS requests to API `/readyz` and the
console must succeed, all three nodes must remain `Ready`, and every
ClusterOperator must be Available, not Progressing, and not Degraded. Never use
the `.29` VIP directly as an adapter fallback and never use `curl -k`.

Record timestamps and pass/fail summaries only. Do not paste tokens, headers,
raw ClusterOperator messages, or kubeconfig content into evidence.

Do not merge or apply the k3s Deployment split until this gate has passed and
the required `homepage-okd-api` Secret exists. The active Argo CD Application
is automated; merging the manifests is itself the one-time migration.

#### Preflight record — 2026-08-12

The uninterrupted gate ran from `2026-08-12T22:00:03Z` through
`2026-08-12T22:30:03Z` and passed 110 of 110 samples. During the full window,
normal DNS returned the approved API and console addresses from both
`utility-01` and the disposable k3s pod; strict-TLS API readiness and console
requests succeeded; all three nodes remained `Ready`; every ClusterOperator
remained Available, not Progressing, and not Degraded; and no pending CSR
appeared.

The final snapshot also returned HTTP `200` for all six allowlisted API
resource families from k3s, showed zero probe-pod restarts, and confirmed the
k3s Secret contains only `server` and `token`. The OKD RBAC validator passed
all positive and negative checks. The disposable probe was deleted after the
evidence was captured; the read-only identity and required Secret remain.

Before this successful window, `pve-02` was power-cycled and its Intel e1000e
link was stabilized by persistently disabling TSO and GSO on `nic0`. The final
snapshot showed both features off, the `bastion-01` VM running, and no hardware
unit hang in the current boot. DNS was also corrected so private wildcard AAAA
lookups return an authoritative empty answer instead of `NXDOMAIN`; no direct
control-plane-IP fallback or TLS bypass was introduced.

### Preview-only deployment and 24-hour soak

After the preflight passes, manually dispatch the Homepage image workflow with
`deploy_preview=true`. Push builds publish a scanned candidate but never deploy
it automatically; the gated dispatch pins only `homepage-custom-preview`.
Confirm production still contains its prior digest and preview has no
`home-assistant-control*` or `action-state` mounts. During one uninterrupted
24-hour window require:

- node CPU/memory within one refresh interval of `oc adm top nodes`, plus exact node and workload inventory totals;
- correct Overview, Compute, Network, Services, OKD, global severity, alert deduplication, and alert destinations for healthy and observed unhealthy states;
- no unexplained stale interval, pod restart, permission failure, raw condition message, credential-shaped response/log field, or TLS bypass;
- recovery from observed transient failures without browser cache clearing; and
- image digest, start/end time, restart count, source freshness, and redaction evidence recorded in the evidence index.

Any candidate, RBAC, credential, network policy, severity, or public-contract
change invalidates the soak and starts a new 24-hour window.

#### Preview soak record — 2026-08-13

The first scanned preview candidate exposed a validation failure before its
soak began: all eight OKD CPU/memory history series stayed at one point. Commit
`d88b7bd` corrected the two-second graph sampler and added a regression test.
The replacement workflow passed quality, browser, manifest, build, and exact
image-digest scan checks, then GitOps commit `c7b619f` pinned preview to
`sha256:c77a3dd7dd2769e1cb3be6340fc3fc84e85723431b54c2e9a43c92b5d53b869b`.
Production retained its previous digest.

The replacement preview baseline passed at `2026-08-13T02:56:22Z`. Schema 5
reported three current and healthy OKD nodes, 34 healthy ClusterOperators, 83
workloads with none unready, global severity `OK`, and eight current history
series with at least 30 points each. Every approved route returned HTTP `200`
with strict TLS; preview and production were Ready with zero restarts; Argo CD
was Synced and Healthy; and summarized response/log scans found no permission
failure or credential-shaped field/value. The uninterrupted soak must run
through at least `2026-08-14T02:56:22Z`; any invalidating change restarts it.

Commit `f57f85c` then changed the OKD node presentation so Compute and `/okd`
use the same card hierarchy as `pve-01` and `pve-02`. Because this produced a
new candidate, it invalidated the preceding window. Quality, unit, integration,
Playwright, accessibility, production-build, manifest, and image-scan gates
passed, and GitOps commit `8887ab5` pinned preview to
`sha256:7fcadc445fbe9b7c04400bfa5b5f39a8d3a56ca26cf26204c216dc6aa7c40a0b`.
Production remained pinned to
`sha256:91f90bdea9e1ebae80e9c16515acb12df68e64ca9f89f813819879b73367afec`.

The new baseline passed at `2026-08-13T04:49:03Z`: Argo CD was Synced and
Healthy; preview was Ready with zero restarts; strict-TLS health, Compute, OKD,
and bootstrap routes returned HTTP `200`; schema 5 reported three current and
healthy nodes, 34 healthy ClusterOperators, 83 workloads with none unhealthy,
global severity `OK`, and eight current history series with 56 points each.
The public response contained zero credential-shaped keys. The only preview
error event was the expected `indoor.actions.disabled` event caused by the
preview Deployment's deliberate lack of control credentials. This candidate's
uninterrupted soak must run through at least `2026-08-14T04:49:03Z`.

Commit `adcd779` then replaced the prominent OKD readiness label with the
git-owned hardware inventory value `AMD Ryzen 5 PRO 5650GE · 6C/12T` while
retaining live readiness in each card's Health section. Kubernetes does not
publish a friendly processor model in the ordinary Node response, so this
label is intentionally keyed by normalized node name; utilization, memory,
readiness, freshness, and severity remain live OKD API data. No additional API
route or RBAC permission was added.

The image workflow and exact-digest scan passed, and GitOps commit `33d55d3`
pinned preview to
`sha256:70d0459534065d3fefa98bf977b58f13a1f05ab1063925fae6acfef10a8150e2`.
The new live baseline passed at `2026-08-13T05:03:26Z`: all three cards rendered
the expected model without overflow, schema 5 remained current and globally
`OK`, all 34 ClusterOperators were healthy, no OKD workload was unhealthy, the
public response contained zero credential-shaped keys, Argo CD was Synced and
Healthy, and preview was Ready with zero restarts. Production retained digest
`sha256:91f90bdea9e1ebae80e9c16515acb12df68e64ca9f89f813819879b73367afec`.
This candidate's uninterrupted soak must run through at least
`2026-08-14T05:03:26Z`.

Commit `d145dce` then made the OKD cards reuse the literal Proxmox host-card
component and added distinct PDU power, load average, and expandable 12-thread
CPU detail for all three nodes. The live acceptance check rejected its first
preview image because Thanos returned HTTP `400` for incorrectly escaped regex
dots; power worked, but load and core fields remained null. Commit `7d56453`
corrected the PromQL string encoding and added a decoded-query regression test.
The rejected digest is not a soak candidate.

GitOps commit `1e24d84` pinned the superseding scanned preview image to
`sha256:598690183a8e0bc0ebb4d0c2357a5a1bc8fac9d616003499118467bab1b5b10d`.
The new container started at `2026-08-13T14:58:08Z` with zero restarts. The
baseline at `2026-08-13T14:59:19Z` passed strict-TLS health, Compute, and `/okd`
HTTP `200` checks; Argo CD was Synced and Healthy; schema 5 and global severity
were `OK`; all three OKD nodes had distinct measured watts, three load values,
12 logical-core values, and all 36 core-history series; all 34
ClusterOperators were healthy; no OKD workload was unhealthy; and the public
response contained no credential-shaped or raw Kubernetes-object keys.
Production remained pinned to
`sha256:91f90bdea9e1ebae80e9c16515acb12df68e64ca9f89f813819879b73367afec`.
This candidate's uninterrupted soak must run through at least
`2026-08-14T14:58:08Z`.

Commit `4093cb9` expanded the fixed OKD Thanos query catalog from four to 16
expressions so the shared Proxmox-style cards can also show root-disk usage and
I/O, physical-interface RX/TX rates and totals, swap, hottest sensor
temperature, uptime, and running/stopped container counts. The catalog remains
server-owned and node-allowlisted; it did not add browser-supplied PromQL, a
TLS exception, or an RBAC grant. CPU clock remains unsupported because the
cluster has no trustworthy CPU-frequency series (the available hardware clock
is a Radeon GPU clock), and VM counts remain unsupported because this cluster
does not expose KubeVirt inventory.

The image workflow passed lint, types, 191 unit tests, integration, Kubernetes
rendering, 31 Playwright/accessibility checks, the production build, and the
exact-image scan. GitOps commit `e35ec43` pinned preview to
`sha256:bb16b808f15152c713c3f6413f2c316a42de4e5926cdbbeb185a9d797ff8a0f1`.
The new container started at `2026-08-13T15:20:13Z` with zero restarts. The
live baseline reported schema 5, global severity `OK`, three current and Ready
OKD nodes, 34 healthy ClusterOperators, 115 workloads with none unhealthy,
and complete values for every newly supported field on every node. Each node
also had 12 current core-history series plus current CPU, memory, disk, RX, and
TX histories; the public 15-minute disk-history route returned 58 points.
Strict-TLS health, Compute, OKD, bootstrap, Argo CD Synced/Healthy, and response
redaction checks passed. Production remained pinned to
`sha256:91f90bdea9e1ebae80e9c16515acb12df68e64ca9f89f813819879b73367afec`.
This candidate's uninterrupted soak must run through at least
`2026-08-14T15:20:13Z`.

Commit `3e01b7a` corrected the OKD network graph feed to match the Proxmox
cards' responsive throughput semantics. The shared mirrored graph component,
four-row layout, units, peak labels, and total-transfer field were already
identical; the mismatch was the OKD five-minute moving-average query. The two
fixed `eno1` expressions now use the latest scrape pair from a two-minute
lookback, which was verified against all three allowlisted nodes before
deployment. Poll frequency, query count, RBAC, TLS, and the public contract did
not change.

The image workflow passed lint, types, 192 unit tests, integration, Kubernetes
rendering, 31 Playwright/accessibility checks (including OKD graph parity), the
production build, and exact-image scanning. GitOps commit `ffbd2f7` pinned
preview to
`sha256:9c81674bf9ae501bbee543c75dc3a5178622d528b626f806405ca6decc825304`.
The new container started at `2026-08-13T17:06:52Z` with zero restarts. The
live baseline reported schema 5, global severity `OK`, current non-null RX/TX
and total counters for all three nodes, and all six current RX/TX history
series. After four independent OKD samples, every series contained distinct
values; the public 15-minute RX history route returned HTTP `200`. Strict-TLS
health, Compute, OKD, bootstrap, Argo CD Synced/Healthy, and response-redaction
checks passed. Production remained pinned to
`sha256:91f90bdea9e1ebae80e9c16515acb12df68e64ca9f89f813819879b73367afec`.
This candidate's uninterrupted soak must run through at least
`2026-08-14T17:06:52Z`.

Commit `38a0e46` removed the unsupported CPU-clock and virtual-machine rows
from OKD node cards. A live audit found two useful replacement series on every
allowlisted node, so the fixed catalog now also reports kubelet running pods
against Kubernetes allocatable pod capacity. Host process count was available
but deliberately left out because it is less actionable and would add noise.
The Proxmox card fields remain unchanged, and the OKD drill-down now contains
only load trend, swap, containers, pods, and the supported per-core view.

The image workflow passed lint, types, 192 unit tests, integration, Kubernetes
rendering, 31 Playwright/accessibility checks, the production build, and
exact-image scanning. GitOps commit `1d5be51` pinned preview to
`sha256:44f9b75e97d8af78b30091ec1a18f0302cbe20190e156164b8b14be16ad0a8ea`.
The new container started at `2026-08-13T19:50:24Z` with zero restarts. Live
schema 5 values were `35 / 250`, `83 / 250`, and `55 / 250` running versus
allocatable pods; all three OKD nodes were Current/OK, strict-TLS health,
Compute, and OKD routes returned HTTP `200`, the public response contained no
credential-shaped keys, and Argo CD was Synced/Healthy. Global severity was
`INFO` solely because the weather source was informational; no OKD host,
cluster, operator, workload, or service was non-OK. Production remained pinned
to `sha256:91f90bdea9e1ebae80e9c16515acb12df68e64ca9f89f813819879b73367afec`.
This candidate's uninterrupted soak must run through at least
`2026-08-14T19:50:24Z`.

### Promotion and rollback

After approval, copy the exact preview `image:` value (tag plus digest) into
`production-deployment.yaml`; do not rebuild or retag. Re-run API, UI, alert,
TLS, RBAC, and redaction checks against production. Promotion changes no Secret
or Service selector.

Rollback changes only production's image to its previous digest. Keep the
read-only OKD identity and preview Deployment unless credentials are suspected.
The one-time Deployment split uses Argo CD waves: the PVC exists first, preview
is reconciled read-only next, and production acquires the RWO journal last.
Homepage remains available, but indoor actions can briefly be unavailable.
