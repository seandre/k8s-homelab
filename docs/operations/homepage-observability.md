# Homepage Observability Expansion

Status: implemented in GitOps on 2026-07-20; host exporter installation is an
operator-run prerequisite. This runbook expands the preview Homepage with
read-only live telemetry and does not change production Homepage traffic.

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

## Homepage data boundary

The preview backend polls on its existing five-second refresh loop and sends a
normalized bootstrap/SSE contract to the browser. It reads only fixed,
Git-owned endpoints and queries:

- Proxmox: node CPU identity/clock/load, memory, swap, storage, uptime, guest
  totals, plus Glances CPU-core, sensor, filesystem, disk, and network fields.
- k3s: nodes, workload readiness, `metrics.k8s.io` node CPU/memory, and the
  fixed Prometheus cluster-capacity catalog.
- Prometheus: four fixed aggregate capacity/usage queries only; no browser
  PromQL input exists.
- Alertmanager: active alerts only; no silences, acknowledgements, or writes.
- Argo CD, PBS, UniFi, Open-Meteo, and the fixed Argo CD reachability probe,
  using their existing read-only identities where supplied.

Homepage egress to Prometheus and Alertmanager is limited by the preview
NetworkPolicy to their monitoring namespace pods on TCP 9090 and 9093. The
custom ServiceAccount now adds only `get/list/watch` for `metrics.k8s.io`
nodes and pods; it still has no Secret or mutation permission.

PDU/power remains `NOT_SUPPORTED`. No command in this runbook enables outlet
control, starts a speed test, changes an alert, or writes to an upstream API.

## Review gates and rollback

Before deploying this revision to preview, perform a new Gate C review of:

1. the 50 GiB local-path placement trade-off;
2. each host-side node_exporter installation and its firewall evidence; and
3. the expanded backend's normalized response, with no credential-shaped text.

After the preview image is deployed, start a new Gate D soak. The prior soak
does not carry forward because this revision changes data sources and egress.

Rollback is Git-only: revert the monitoring storage/scrape and preview
Homepage commits, sync through Argo CD, and retain the stock Homepage. Do not
delete the Prometheus PVC unless intentionally discarding its retained history.
