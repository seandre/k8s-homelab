# IE-004 Home Assistant k3s Foundation Evidence

Date: 2026-07-21

Result: **LIVE WITH TWO ACCEPTANCE ITEMS PENDING**. The foundation is deployed
from `main`, Argo is healthy, and pod-replacement persistence is proven. Private
split DNS and a literal prior-image rollback remain outstanding as described
below.

## Fixed deployment contract

- Image:
  `ghcr.io/seandre/k8s-homelab-home-assistant:sha-b5bc31cb8f0ac715f5794c95e03510e03658a5e4@sha256:9f0c4eb2c42db67d70c12ff6ca3ed9c1fcd314d9f66929a0de61064654610803`
- Namespace and workload: `home-assistant`, one `Recreate` Deployment replica.
- Persistence: 10 GiB `local-path` ReadWriteOnce PVC mounted at `/config`.
- Bootstrap: Git-owned read-only `configuration.yaml`; writable `.storage` and
  all runtime data remain on the PVC.
- Access: private Traefik ingress `ha.lab.seandre.dev` with the existing
  production ACME issuer and a ClusterIP Service on TCP 8123.
- Initial network paths: Traefik ingress, kube-dns TCP/UDP 53, and public HTTPS
  TCP 443 only. Atom, Prometheus, Homepage, API-server, and RFC1918 egress are
  absent.
- Safeguards: no service-account token, dropped Linux capabilities, no privilege
  escalation, runtime-default seccomp, resource requests/limits, startup,
  readiness, and liveness probes.

## Changed files

- `kubernetes/apps/home-assistant/*`
- `kubernetes/clusters/homelab/apps/kustomization.yaml`
- `home-assistant/k3s/test-manifests.sh`
- `docs/operations/home-assistant-k3s.md`
- `docs/operations/indoor-dashboard-ie-004-evidence.md`
- `docs/overview/indoor-dashboard-baseline.md`

## Verification

```sh
home-assistant/k3s/test-manifests.sh
kubectl kustomize kubernetes/apps/home-assistant
kubectl kustomize kubernetes/clusters/homelab/apps
git diff --check
```

Local result: **PASS**. Both the standalone app and full cluster apps aggregate
rendered, the manifest contract test passed, and `git diff --check` reported no
errors. A read-only live preflight confirmed `homelab-apps` was Synced/Healthy,
`local-path` exists with
`WaitForFirstConsumer`, and the live Traefik namespace/pods have the exact labels
used by the ingress NetworkPolicy.

## Live acceptance evidence

- Git commit: `ab40f68` on `main` (Argo observed the subsequent docs revision
  `d023ef01f7d8d9ed45e0fc85862fea4b6067818c`).
- Argo `homelab-apps`: `Synced` / `Healthy`.
- Running image ID:
  `ghcr.io/seandre/k8s-homelab-home-assistant@sha256:9f0c4eb2c42db67d70c12ff6ca3ed9c1fcd314d9f66929a0de61064654610803`.
- PVC UID `997d5a98-3d46-4d55-832c-4f65f77b9605` is `Bound` to
  `pvc-997d5a98-3d46-4d55-832c-4f65f77b9605`.
- A non-sensitive marker written under `/config` survived replacement of pod
  UID `5c12d47c-835d-4cbf-8c80-74a1bbdea9d4` by pod UID
  `d34b988d-5fbc-4dc9-9a0e-9ae73f2398d8`; the PVC UID was unchanged and the
  marker was removed after verification.
- `home-assistant-tls` is Ready, its ACME order is valid, and a strict-TLS
  request forced through ingress VIP `192.168.40.30` returned HTTP 302 to the
  onboarding flow with certificate verification result 0.
- `ha.lab.seandre.dev` does not yet resolve through private split DNS. Add a
  UniFi CNAME to `ingress.lab.seandre.dev` (or an A record to
  `192.168.40.30`) before calling onboarding reachable by canonical name.
- Git-based prior-image rollback and forward recovery remain pending.

No previous accepted production Home Assistant image exists before IE-004. The
first deployment can prove Git rollback mechanics and persistence, but the
literal prior-image acceptance check requires the next accepted image digest.
That limitation must not be misreported as a prior-image test.

## Rollback and handoff

Before live deployment, revert this package to remove the Argo selection and
resources. After onboarding, revert only workload/config changes unless the
owner explicitly intends to destroy Home Assistant; retain the PVC. Image
rollback uses the exact prior full-SHA tag and digest as documented in the
operations runbook.

IE-005, IE-007, and IE-008 remain blocked until live onboarding, pod replacement,
and persistence checks pass. IE-005 and IE-007/008 also retain their respective
owner-operated gates. The first literal prior-image rollback proof remains an
IE-004 closeout item when a second accepted image exists.
