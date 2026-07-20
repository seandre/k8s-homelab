# Custom Homepage Preview and Rollback Runbook

This runbook operates the custom Homepage preview without changing the stock
`homepage` workload or `home.lab.seandre.dev`. The preview manifests are in
`kubernetes/apps/homepage-custom-preview/`; they are deliberately absent from
the Argo application resource list until Gate D is owner-approved.

## Current immutable preview artifact

The approved preview image is:

```text
ghcr.io/seandre/k8s-homelab-homepage@sha256:7f287753c7fcfa9d857a06b9d5eab1f0e12735860f070f865d22bedc355f9391
```

It was published by the successful Homepage image workflow for commit
`aa75fd3`. The Deployment references this digest, never a mutable tag.

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

Gate D requires explicit owner approval before this section is performed.

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

The preview Deployment enables `LIVE_TELEMETRY=true`. At a five-second
interval, it reads the mounted Proxmox read-only credentials for current node
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

## Gate D soak — in progress

The owner approved a 24-hour preview soak beginning at `2026-07-20T17:09:32Z`
after the SSE crash-loop fix. The planned end is `2026-07-21T17:09:32Z`.
Production traffic remains unchanged and HP-029 remains unapproved.

Opening checks passed at the start of the window:

- Preview `/` and `/api/health/ready` returned HTTP 200.
- Argo CD application `homelab-apps` was `Synced/Healthy` at revision
  `5a664323764546f19f52a6e9f29984d60724c97b`.
- The isolated preview pods were Ready with zero restarts, spread across
  `k8s-worker-01` and `k8s-worker-02`, using pinned digest
  `sha256:0943363a7225dffa42475bd8184fd994be4dfd6ddafa401f358f374337abe066`.

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

After a future HP-029 cutover, revert the reviewed Git commit that changes
production Service/Ingress ownership, sync through Argo CD, and verify
`homepage`, `homepage-public-tls`, and `home.lab.seandre.dev` are healthy.
Never depend on rebuilding an image or deleting the stock ConfigMap to roll
back.
