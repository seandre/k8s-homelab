# Homepage Observability Expansion

Status: implemented in the preview GitOps path on 2026-07-20. The UniFi PDU
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

Rename the two PDU outlets exactly `pve-01` and `pve-02`; capitalization and
hyphenation are part of the telemetry contract. Additional outlets labeled for
OKD nodes are included in the PDU total only. They are not mapped to Homepage
hosts and do not change the exact `pve-01`/`pve-02` contract.

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
```

Record the one discovered `name` label in
`homepage/src/server/runtime-config.ts` at `pduPower.deviceName`, change only
`pduPower.enabled` to `true`, rebuild the preview image, and commit both values
as one reviewed change. A failed count, an unexpected label, a missing outlet,
or a TLS failure means leave the mapping disabled: Homepage continues to show
`NOT SUPPORTED` and must not map any PDU values to a host.

After deployment, query the three fixed expressions and compare the outlet and
total watts with the UniFi dashboard within one 30-second collection interval:

```bash
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="pve-01"})' http://127.0.0.1:9090/api/v1/query
curl --get --data-urlencode 'query=sum(unpoller_device_outlet_outlet_power{name="RECORDED_PDU_NAME",outlet_name="pve-02"})' http://127.0.0.1:9090/api/v1/query
```

Only after those results and an API-key/certificate/mapping review may PDU
power be called implemented. Soak preview for one hour with no target failure,
stale PDU value, or false alert. The browser response must contain only the PDU
total and the two host watts; it must not contain the controller, PDU name,
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
health, and Homepage runs three fixed aggregate queries. Bootstrap schema v2
exposes only total watts, `pve-01`/`pve-02` host watts, freshness, and source
state. It excludes the API key, controller and device identifiers, PDU name,
outlet labels, and raw Prometheus data. OKD-labeled outlets contribute to the
total PDU draw only.

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
- Prometheus: four fixed aggregate capacity/usage queries plus three fixed PDU
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
