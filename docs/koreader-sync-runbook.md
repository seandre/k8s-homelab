# KOReader Sync Runbook

KOReader Sync is managed by Argo CD from `kubernetes/apps/kosync` and selected by `kubernetes/clusters/homelab/apps/kustomization.yaml`.

## Design

| Item | Value |
|---|---|
| Namespace | `kosync` |
| Image | `koreader/kosync:v2.1.1` |
| Service port | `17200` |
| Hostname | `kosync.lab.home.arpa` |
| TLS issuer | `homelab-ca` |
| Persistent data | 1 GiB `local-path` PVC mounted at `/var/lib/redis` |

The upstream all-in-one container bundles Redis. The PVC survives pod replacement, but `local-path` storage is node-local and is not resilient to loss of that node.

## Deploy and Verify

Validate the rendered manifests before pushing a change:

```bash
kubectl kustomize kubernetes/apps/kosync
kubectl kustomize kubernetes/clusters/homelab/apps
```

After Git and Argo CD reconcile:

```bash
kubectl -n argocd get application homelab-apps
kubectl -n kosync get deploy,pod,svc,ingress,pvc,certificate
kubectl -n kosync rollout status deployment/kosync
kubectl -n kosync logs deployment/kosync
curl -v https://kosync.lab.home.arpa/healthcheck
```

Expected state:

- `homelab-apps` is `Synced` and `Healthy`.
- The deployment is available and its pod is `Running`.
- The PVC is `Bound`.
- `kosync-tls` is ready.
- The health check succeeds from a client that trusts the homelab CA.

## Account Bootstrap

The current manifest enables registration with `ENABLE_USER_REGISTRATION=true`. Create the intended account from KOReader, then change the value to `false`, commit, push, and verify the rollout:

```bash
kubectl -n kosync rollout status deployment/kosync
kubectl -n kosync logs deployment/kosync
```

Do not leave registration enabled after account creation.

## Persistence Test

After creating test sync data, replace the pod and confirm the client can still retrieve it:

```bash
kubectl -n kosync rollout restart deployment/kosync
kubectl -n kosync rollout status deployment/kosync
kubectl -n kosync get pvc
```

This proves pod replacement, not node-loss recovery. Do not rely on the data until a backup and restore procedure has been tested.

## Client Setup

Set the custom sync server to:

```text
https://kosync.lab.home.arpa
```

Clients must trust the homelab root CA. The `utility-01` desktop procedure is documented in [Utility Desktop and KOReader](utility-desktop-koreader-tutorial.md).

## Next Hardening Steps

1. Disable user registration after bootstrap.
2. Test backup and restore of Redis data.
3. Move to resilient storage before treating sync state as important.
4. Add monitoring for pod health, PVC usage, and failed probes.
5. Consider separating Redis only after the simple deployment is understood.
