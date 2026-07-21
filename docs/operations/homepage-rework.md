# Custom Homepage Preview, Production Cutover, and Rollback Runbook

This runbook operates the custom Homepage preview and the approved production
cutover. The preview manifests in `kubernetes/apps/homepage-custom-preview/`
are deployed through Argo CD. The stock `homepage` workload and its Service,
ConfigMap, TLS Secret, and Ingress identity remain available as the Git-only
rollback target.

## Current immutable preview artifact

The current preview image is:

```text
ghcr.io/seandre/k8s-homelab-homepage@sha256:d75558ed538c832d9f51259d022511619e44aac1af5d7c6c059d85ef97297dc5
```

It contains the validated PDU mapping enabled at Git revision `c3d8968`. The
Deployment references this digest, never a mutable tag. Earlier digests in the
dated verification records below are retained as historical evidence and are
not the current artifact.

The image was readable from GHCR without credentials at publication time. If
the package becomes private, create a namespace-local `dockerconfigjson` pull
Secret from a GitHub Packages read token held outside Git, add its name under
`spec.template.spec.imagePullSecrets`, and verify an image pull before
revoking any previous pull credential. Do not commit a pull Secret or a token.

## Preview prerequisites

Before Gate D, verify the manifest and non-secret prerequisites only:

```bash
kubectl kustomize kubernetes/apps/homepage-custom-preview
kubectl -n homepage get secret \
  homepage-argocd-readonly \
  homepage-proxmox-pve01 \
  homepage-proxmox-pve02 \
  homepage-pbs-readonly \
  homepage-unifi-readonly
```

The preview hostname is `homepage-preview.lab.seandre.dev`. Its private DNS
record must resolve to ingress VIP `192.168.40.30`; the preview Ingress requests
the existing `letsencrypt-production` issuer and stores its certificate in
`homepage-custom-preview-tls`.

All five integration Secret volumes are optional while every live adapter is
disabled and fixture-backed. A missing Secret must therefore not block pod
readiness. When an adapter is enabled later, require only that adapter's
Secret and keep unrelated adapters isolated.

## Gate D deployment procedure

Gate D requires explicit owner approval before this section is performed. The
preview deployment was approved and completed; these steps remain the repeatable
procedure, not an instruction to redeploy the already-running preview.

1. Add `../../../apps/homepage-custom-preview` to
   `kubernetes/clusters/homelab/apps/kustomization.yaml`. Do not alter the
   existing `../../../apps/homepage` resource, its Service, or its Ingress.
2. Render and client-validate the application before pushing:

   ```bash
   kubectl kustomize kubernetes/clusters/homelab/apps
   kubectl kustomize kubernetes/apps/homepage-custom-preview \
     | kubectl apply --dry-run=client --validate=true -f -
   ```

3. Push the reviewed Git change to `main` and let the existing `homelab-apps`
   Argo CD Application reconcile it. Do not use an imperative `kubectl apply`
   for the preview resources.
4. Confirm the two-replica rollout and placement:

   ```bash
   kubectl -n homepage rollout status deployment/homepage-custom-preview --timeout=180s
   kubectl -n homepage get deployment,replicaset,pod \
     -l app.kubernetes.io/name=homepage-custom,app.kubernetes.io/instance=preview -o wide
   kubectl -n homepage get pod \
     -l app.kubernetes.io/name=homepage-custom,app.kubernetes.io/instance=preview \
     -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,READY:.status.containerStatuses[0].ready
   kubectl -n homepage get ingress homepage-custom-preview
   kubectl -n homepage get certificate homepage-custom-preview-tls
   ```

5. Once DNS and TLS are ready, inspect only safe response metadata and the
   normalized UI contract:

   ```bash
   curl --fail --silent --show-error --head https://homepage-preview.lab.seandre.dev/
   curl --fail --silent --show-error https://homepage-preview.lab.seandre.dev/api/health/live
   curl --fail --silent --show-error https://homepage-preview.lab.seandre.dev/api/health/ready
   curl --fail --silent --show-error https://homepage-preview.lab.seandre.dev/api/v1/bootstrap
   ```

6. Verify preview logs and the browser bundle do not expose credential-shaped
   data. Do not print any Secret value while doing so:

   ```bash
   kubectl -n homepage logs deployment/homepage-custom-preview --all-containers=true
   if curl --fail --silent --show-error https://homepage-preview.lab.seandre.dev/ \
     | rg 'PVEAPIToken|Authorization: Bearer|token-secret|homepage-proxmox'; then
     echo "credential-shaped text found in the browser response" >&2
     exit 1
   fi
   ```

7. Exercise one controlled replacement, then repeat rollout, readiness, view,
   responsive-layout, keyboard, accessibility, live/stale/recovery, resource,
   and link checks before beginning the owner-approved soak period:

   ```bash
   kubectl -n homepage rollout restart deployment/homepage-custom-preview
   kubectl -n homepage rollout status deployment/homepage-custom-preview --timeout=180s
   kubectl -n homepage top pod \
     -l app.kubernetes.io/name=homepage-custom,app.kubernetes.io/instance=preview
   ```

Record the soak duration, results, and any adapter status in Gate D evidence.
Do not change production traffic until the owner explicitly approves HP-029.

## Gate D initial verification — 2026-07-20

The initial preview deployment was approved and reconciled at Git revision
`fe137fe65bd575046d03d347f03a069d23606635`. Argo CD reported
`Synced/Healthy`, and the stock `homepage` Deployment, Service, and
`home.lab.seandre.dev` Ingress were not changed.

| Check | Result |
|---|---|
| Preview resources | Deployment, Service, Ingress, PDB, and NetworkPolicy present under the distinct `homepage-custom-preview` name |
| Availability and spread | 2/2 ready, zero-restart pods: one on `k8s-worker-01`, one on `k8s-worker-02` |
| Image and runtime hardening | Pinned `sha256:7f287753…f9391`, custom read-only ServiceAccount, read-only root filesystem |
| TLS and hostname | Let’s Encrypt certificate `Ready=True`; subject `homepage-preview.lab.seandre.dev`; UDM split-DNS resolves through `ingress.lab.seandre.dev` to `192.168.40.30` |
| Application smoke test | HTTPS `/`, `/api/health/live`, `/api/health/ready`, and normalized `/api/v1/bootstrap` returned successfully |
| SSE | `/api/v1/events` returned HTTP 200 with `text/event-stream`; idle timeout is expected while no event is emitted |
| Least privilege and redaction | Custom ServiceAccount can get nodes but cannot list Secrets; browser response contained no credential-shaped markers |
| Resource use | Each pod was 1m CPU and 24–25Mi memory at the initial check |

The owner must specify the soak duration and complete the interactive
view/layout/link review before Gate D is recorded as complete. Production
cutover remains prohibited until a separate HP-029 approval.

### Preview live Proxmox telemetry

The preview Deployment enables `LIVE_TELEMETRY=true`. Graph telemetry is
sampled from Glances on an independent two-second timer, while the broader
inventory refresh remains on a six-second timer. The graph request has a
1.5-second bound and does not wait for the broader refresh. That refresh reads
the mounted Proxmox read-only credentials for current node
identity, CPU model, clock, load, memory, storage, uptime, and guest counts,
then combines those values with approved Glances CPU, temperature, and network
samples. The browser receives only normalized values; no upstream credential
is included in the API contract or event stream.

Each CPU, memory, disk, RX, and TX graph keeps the most recent 104 genuine
samples in memory. Until a metric has a sample, its braille graph is blank and
labelled `N/S`; it is never populated with fixture or interpolated history.
The normalizers retain a last successful source sample long enough to represent
stale data accurately. Restarting a pod resets this short in-memory window.

## Gate D live telemetry verification — 2026-07-20

The preview was reconciled at Git revision `18f3888655d6fbb0fe3100735a5e99a6d817fbba`
to the pinned image digest `sha256:8181ffc4da0b4a76402248d8d9f12f804c8d9be388f84ae0be7855ddb2bcfb33`.
Both preview pods became Ready on separate worker nodes. The public normalized
bootstrap contract then showed `CURRENT` samples for `pve-01` and `pve-02`:

- CPU identity, clock, load, memory, disk, and guest data came from the
  read-only Proxmox APIs. Both hosts reported their actual
  `Intel(R) Core(TM) i5-10500T CPU @ 2.30GHz · 12T` identity.
- CPU, memory, disk, RX, and TX each had 12 real five-second samples for both
  hosts. RX/TX came from Glances v4 `bytes_*_rate_per_sec` interface metrics.
- No fixture values were used for these Proxmox cards. The public response
  contained normalized metrics only; credentials were not read or logged.

## Gate D soak — superseded

The owner approved a 24-hour preview soak beginning at `2026-07-20T17:09:32Z`
after the SSE crash-loop fix. It is superseded before completion by the
2026-07-20 observability expansion: Prometheus persistence, monitoring egress,
and additional live read-only adapters change the preview data boundary.
Production traffic remains unchanged and HP-029 remains unapproved.

Opening checks passed at the start of the window:

- Preview `/` and `/api/health/ready` returned HTTP 200.
- Argo CD application `homelab-apps` was `Synced/Healthy` at revision
  `5a664323764546f19f52a6e9f29984d60724c97b`.
- The isolated preview pods were Ready with zero restarts, spread across
  `k8s-worker-01` and `k8s-worker-02`, using pinned digest
  `sha256:0943363a7225dffa42475bd8184fd994be4dfd6ddafa401f358f374337abe066`.

The replacement revision requires a fresh Gate C review and a fresh Gate D
soak. See [Homepage Observability Expansion](homepage-observability.md) for
the host-exporter prerequisite and exact boundary.

## Gate D PDU telemetry verification — 2026-07-20

The UniFi PDU Pro preflight passed and the mapping was enabled at Git revision
`c3d8968`. The current preview image is pinned to
`sha256:d75558ed538c832d9f51259d022511619e44aac1af5d7c6c059d85ef97297dc5`.
UnPoller reaches the local controller over verified TLS with the manual
API-key Secret; Prometheus retains only the outlet-power metric plus scrape
health.

Exactly one PDU was discovered, with exactly one series for each required
`pve-01` and `pve-02` outlet label. Homepage bootstrap schema v2 exposes the
PDU total and those two normalized host watt values without controller/device
identifiers, PDU or outlet names, credentials, or raw metrics. Outlets labeled
for OKD nodes contribute to the total PDU draw only and are not assigned to a
host card.

The one-hour replacement window was shortened by owner direction. The later
Homepage replacement pod started at `2026-07-20T21:08:23Z`, and the owner-
approved shortened soak closed at `2026-07-20T21:37:34Z` (approximately 29
minutes). The final technical checks passed:

| Check | Result |
|---|---|
| Argo CD `homelab` | `Synced` / `Healthy` at `c3d8968` |
| Homepage preview | 2/2 Ready; both pods had zero restarts; pinned image digest matched the deployed manifest |
| UnPoller | 1/1 Ready; zero restarts |
| Prometheus target history | `min_over_time(up{service="unpoller"}[1h])` returned `1` |
| Retention and mapping | One retained `unpoller_*` family; exact `pve-01` and `pve-02` series were continuously present |
| Related alerts | No PDU/UnPoller-related firing alert |
| Public bootstrap | Schema `2`, PDU freshness `CURRENT`, total and both PVE watt values non-null |
| Public redaction | No PDU name, outlet label, controller endpoint, API-key, token, Secret, password, or credential marker; the existing generic `network.unifi.controller` status label is `UniFi Site Manager` and is not a PDU identifier |

Gate D preview technical closeout is recorded. HP-029 production cutover is
recorded below.

## HP-029 production cutover — 2026-07-20

The owner approved the production change window during this run. Cutover was
published in Git commit `73097848df0618126127a8f66667b716c26add15` and
reconciled by Argo CD at `2026-07-20T21:54:00Z` (verification through
`2026-07-20T21:58:30Z`). The production Ingress keeps its existing name,
hostname, TLS Secret, and Traefik settings, but now targets the separately
named `homepage-custom-production` Service. That Service selects only the
custom labels. The stock `Service/homepage` still selects only
`app.kubernetes.io/name=homepage` and retained the sole stock endpoint.

The stock `Deployment/homepage`, `ConfigMap/homepage`, `Service/homepage`,
`Ingress/homepage`, `Secret/homepage-public-tls`, ServiceAccount, and RBAC
remain present as the rollback target; the Ingress identity, hostname, and TLS
configuration are unchanged while its Git-managed backend now points to the
custom Service. Rollback is a Git revert
of the cutover commit followed by Argo CD reconciliation; no imperative
production apply was used.

| Check | Result |
|---|---|
| Argo CD | `homelab-apps` `Synced` / `Healthy` at `7309784`; parent `homelab` `Synced` / `Healthy` |
| Production HTTPS/TLS | `/` returned 200; strict TLS verification returned `ssl_verify=0` through `192.168.40.30` |
| Health and API | `/api/health/live`, `/api/health/ready`, and schema-v2 bootstrap returned 200; PDU freshness was `CURRENT` |
| SSE | `/api/v1/events` returned 200 with `text/event-stream; charset=utf-8` |
| Routes | `/`, `/compute`, `/network`, `/storage-backups`, `/kubernetes`, `/okd`, `/services`, and `/weather` returned 200 |
| Published links | Nine links returned 200; `nexus.lab.seandre.dev` returned expected 403 while remaining reachable over strict TLS |
| Selector ownership | Stock Service endpoint was only the stock pod; production Service endpoints were the two custom pods |
| Runtime stability | Custom Homepage 2/2 Ready, zero restarts; UnPoller 1/1 Ready, zero restarts; no recent Homepage failure markers |
| Resource use | Custom pods used 25m/46Mi and 28m/42Mi at the observation check |
| Adapter/monitoring state | PVE, k3s, PBS, PDU, and weather adapters were `CURRENT`/`OK`; UnPoller target was up, only the approved family was retained, both PVE series were present, and no related alert was firing |
| Redaction | HTML and normalized bootstrap contained no credential-shaped markers |

The local E2E run passed keyboard navigation, layout controls, and serious or
critical accessibility checks. Six screenshot comparisons failed because the
local actual page heights differed from the checked-in baselines by 15–50 px;
the cutover introduced no application source change. Treat visual baseline
review as follow-up evidence rather than regenerating snapshots during the
production window.

## HP-030 Git-only rollback drill — 2026-07-20

The rollback drill used only Git commits and Argo CD reconciliation. The
unrelated GitHub Actions docs-image commit `3c4e50f` arrived while the rollback
was being prepared; the rollback commit was rebased onto it without changing
the docs deployment or overwriting remote work.

| Direction | Git revision | Argo CD deployment | Result |
|---|---|---|---|
| Custom → stock | `0e2826d6413cebd236fb65337cc5b21ba66a75a9` (`Revert "Cut over homepage production traffic"`) | started `2026-07-20T22:06:06Z`, deployed `2026-07-20T22:06:07Z` | `homelab-apps` and `homelab` `Synced` / `Healthy` |
| Stock → custom | `9335b5b6bdd6ba2fdecaa48f125f107097d1e48f` (`Reapply "Cut over homepage production traffic"`) | started `2026-07-20T22:09:08Z`, deployed `2026-07-20T22:09:09Z` | `homelab-apps` `Synced` / `Healthy`; parent `homelab` `Synced` / `Healthy` |

Measured Git-to-serving recovery was approximately 40 seconds for rollback
(`22:05:27Z` commit to `22:06:07Z` deployment) and 53 seconds for forward
recovery (`22:08:16Z` commit to `22:09:09Z` deployment). No ConfigMap or image
rebuild was used.

| Check | Stock rollback | Custom forward recovery |
|---|---|---|
| Selector ownership | `homepage` Service had only `10.42.0.53:3000`; `homepage-custom-production` was absent | `homepage` Service still had only the stock endpoint; `homepage-custom-production` had only `10.42.0.102:3000` and `10.42.1.54:3000` |
| HTTPS/TLS | `/` 200, strict TLS `ssl_verify_result=0`; `homepage-public-tls` Ready | `/` 200, strict TLS `ssl_verify_result=0`; `homepage-public-tls` Ready |
| Health/API/SSE | Stock `/api/healthcheck` 200. Custom-only `/api/health/live`, `/api/health/ready`, `/api/v1/bootstrap`, and `/api/v1/events` returned the expected 404 because the preserved stock image does not implement the custom API | `/api/health/live`, `/api/health/ready`, `/api/v1/bootstrap`, and `/api/v1/events` all 200; SSE content type `text/event-stream; charset=utf-8` |
| Routes/browser contract | `/` rendered HTML; custom route paths correctly remained unavailable on stock | `/`, `/compute`, `/network`, `/storage-backups`, `/kubernetes`, `/okd`, `/services`, and `/weather` all 200; HTML and normalized API redaction checks passed |
| Published links | All ten configured links reachable over strict TLS: 200/302 as expected, Nexus 403 as expected | Same ten links and statuses after recovery |
| Runtime | Stock pod Ready with 0 restarts | Custom 2/2 Ready with 0 restarts; log scan found 0 error and 0 credential markers; resource check 53m/37Mi and 86m/40Mi |
| Adapter/monitoring | Preserved stock path did not change adapter resources | UnPoller 1/1 Ready with 0 restarts; target up; one retained UnPoller family; two required PVE outlet series; zero related firing alerts |

The restored custom bootstrap reported schema version `2`, PDU freshness
`CURRENT`, non-null total watts and non-null `pve-01`/`pve-02` host watts. The
browser-control runtime was unavailable in this execution environment (no
browser was discoverable), so the interactive browser smoke was not run; the
HTTPS HTML/API contract and all route/link checks passed instead. No selector
overlap, TLS weakening, Prometheus retention change, raw exporter exposure,
outlet-control access, or Secret/API-key change was introduced.

Corrections discovered during the drill: rebase the rollback onto an unrelated
remote docs-image commit before pushing; use absolute system paths for curl in
the elevated shell; and trigger the approved Argo CD hard-refresh annotation
when the forward commit was not observed by the normal poll interval. None of
these changed application resources outside the reviewed Git commits.

## HP-031 v1 documentation closeout — 2026-07-20

The repository now records production ownership, the Git-only rollback target,
the HP-030 drill, and the remaining v1 evidence in the [Homepage v1 evidence
index](../overview/homepage-v1-evidence.md). The stock Homepage Deployment,
ConfigMap, Service, Ingress, TLS Secret, ServiceAccount, and RBAC remain
intentionally deployed; removal requires a separate approved retention plan.

OKD deployment ownership, an OKD overlay, manual cross-cluster switching, and
automatic failover remain deferred. The owner approved the six visual snapshot
baseline updates after review; the focused six-case suite and full nine-test
browser suite passed.

## Credential provisioning and rotation

The integration credential names and expected keys are defined in
`docs/overview/homepage-data-sources.md`. Create or update values from secure
files or hidden prompts; never put a token, CA, or password in Git, a command
line, terminal history, or diagnostic output.

For a rotation, create a replacement upstream token first, update only its
namespace-local Secret with a file-based `kubectl create secret generic ...
--dry-run=client -o yaml | kubectl apply -f -` workflow, then restart the
preview Deployment and wait for readiness. Verify the relevant normalized
adapter result before revoking the old upstream token. The mounted credential
volumes are read-only and optional until their adapters are enabled.

## Failure handling

| Symptom | Safe response |
|---|---|
| `ImagePullBackOff` | Confirm the exact digest exists in GHCR, then verify package visibility or the separate image-pull Secret. Do not replace the digest with a tag. |
| Pods fail readiness | Inspect `homepage-custom-preview` logs and `/api/health/ready`; retain the stock Homepage unchanged. Revert the preview-only Git change if configuration is bad. |
| Adapter returns forbidden or stale | Disable or keep only that adapter disabled, correct its least-privilege identity, rotate its Secret if required, and retest. Do not grant broad Kubernetes or infrastructure permissions. |
| Ingress or certificate fails | Confirm private DNS points to `192.168.40.30`, inspect preview Ingress/Certificate events, and preserve the stock `homepage-public-tls` and production Ingress. |
| Unexpected upstream connectivity failure | Confirm NetworkPolicy ingress from the `traefik` namespace, DNS to CoreDNS, k3s API `10.43.0.1:443`, approved private ports, and public HTTPS. Do not widen the policy to all ports. |

## Rollback

Before production cutover, rollback is simply removing the preview resource
from `kubernetes/clusters/homelab/apps/kustomization.yaml` and letting Argo CD
prune the separately named preview resources. The stock Deployment, ConfigMap,
Service, Ingress, ServiceAccount, and hostname remain untouched.

After HP-029, revert commit `7309784` (or the reviewed descendant that owns
the same cutover), sync through Argo CD, and verify `homepage`,
`homepage-public-tls`, and `home.lab.seandre.dev` are healthy. To restore the
custom app, apply a reviewed forward commit that restores the custom Ingress
backend and Service, then repeat the same checks. Never depend on rebuilding
an image or deleting the stock ConfigMap to roll back.
