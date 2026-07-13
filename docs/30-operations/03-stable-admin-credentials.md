# Operations 03: Stable Argo CD and Grafana Admin Credentials

This tutorial replaces generated bootstrap credentials with stable administrator credentials for Argo CD and Grafana. It stores the plaintext passwords in the administrator Mac's login Keychain, keeps plaintext out of Git, and configures the workloads to consume durable Kubernetes Secrets.

The result survives normal Argo CD reconciliation, Helm upgrades, and pod replacement. It does **not** survive namespace deletion or total cluster loss by itself. Complete [Optional 03: Sealed Secrets](../20-optional/03-sealed-secrets.md), including its controller-key backup exercise, before treating Git as credential disaster recovery.

## Design

| Service | Kubernetes source | Password storage outside Kubernetes | Rotation behavior |
|---|---|---|---|
| Argo CD | `argocd/argocd-secret` | macOS login Keychain | Changes only through an intentional password update |
| Grafana | `monitoring/grafana-admin-credentials` | macOS login Keychain | Changes only when the stable Secret is intentionally replaced |

Argo CD requires the fixed Secret name `argocd-secret`. Its `admin.password` value is a bcrypt hash; `server.secretkey` signs sessions and must not be regenerated during routine reconciliation. `argocd-initial-admin-secret` only delivers the first bootstrap password and should be removed after a durable password is established.

The Grafana Helm chart generates an administrator Secret when no explicit source is configured. Random chart output can change during rendering or release recreation. Setting `grafana.admin.existingSecret` makes a separately managed Secret authoritative instead.

## Security Rules

- Never commit plaintext passwords, base64-encoded Secret data, Argo CD's server signing key, or temporary Secret YAML.
- Do not use `kubectl get secret -o yaml` or print `.data` during routine inspection.
- Remember that base64 is encoding, not encryption.
- Use Keychain Access or a dedicated password manager for plaintext custody.
- Run password-changing commands from a private terminal with shell tracing disabled.
- Back up Sealed Secrets controller keys before depending on encrypted ciphertext in Git.

## 1. Prepare the Workstation

Set the kubeconfig and verify the required tools:

```bash
export KUBECONFIG="$HOME/.kube/k8s-homelab.yaml"

command -v kubectl
command -v jq
command -v openssl
command -v security

kubectl auth can-i patch secret/argocd-secret -n argocd
kubectl auth can-i create secrets -n monitoring
```

Both authorization checks should return `yes`.

Inspect only safe metadata and key names. The `jq` projections are deliberate: they prevent Secret values from being printed.

```bash
kubectl -n argocd get secret argocd-secret -o json |
  jq '{
    name: .metadata.name,
    owners: (.metadata.ownerReferences // [] | length),
    keys: (.data | keys)
  }'

kubectl -n monitoring get secret kube-prometheus-stack-grafana \
  --ignore-not-found -o json |
  jq '{
    name: .metadata.name,
    owners: (.metadata.ownerReferences // [] | length),
    keys: (.data | keys)
  }'
```

Expected Argo CD keys include `admin.password`, `admin.passwordMtime`, and `server.secretkey`. Do not print their values.

## 2. Generate Passwords and Store Them in Keychain

This step intentionally rotates both administrator passwords. It writes each password to the macOS login Keychain before changing Kubernetes.

```bash
set -euo pipefail
umask 077

GRAFANA_PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"
ARGOCD_PASSWORD="$(openssl rand -base64 32 | tr -d '\n')"

security add-generic-password \
  -U \
  -a admin \
  -s grafana.lab.seandre.dev \
  -l "Homelab Grafana admin" \
  -w "$GRAFANA_PASSWORD" >/dev/null

security add-generic-password \
  -U \
  -a admin \
  -s argocd.lab.seandre.dev \
  -l "Homelab Argo CD admin" \
  -w "$ARGOCD_PASSWORD" >/dev/null
```

Confirm the entries exist without printing their passwords:

```bash
security find-generic-password \
  -a admin -s grafana.lab.seandre.dev >/dev/null
security find-generic-password \
  -a admin -s argocd.lab.seandre.dev >/dev/null
```

Use **Keychain Access** to inspect or copy the credentials into the preferred password manager:

1. Press `Command-Space`, type **Keychain Access**, and press Enter.
2. Select the `login` keychain and the **Passwords** category.
3. Search for `Homelab Argo CD admin` or `Homelab Grafana admin`.
4. Open an entry, select **Show password**, and authenticate with macOS.

## 3. Set the Durable Argo CD Password

Generate the bcrypt hash with the Argo CD binary already running in the server container. Supplying the password over stdin prevents the plaintext from appearing in the command line:

```bash
ARGOCD_HASH="$(
  printf '%s\n' "$ARGOCD_PASSWORD" |
    kubectl -n argocd exec -i deployment/argocd-server -- \
      argocd account bcrypt
)"

ARGOCD_MTIME="$(date -u +%FT%TZ)"
```

Patch only the administrator hash and its modification time. This preserves `server.secretkey`:

```bash
jq -n \
  --arg hash "$ARGOCD_HASH" \
  --arg mtime "$ARGOCD_MTIME" \
  '{
    stringData: {
      "admin.password": $hash,
      "admin.passwordMtime": $mtime
    }
  }' |
  kubectl -n argocd patch secret argocd-secret \
    --type merge \
    --patch-file /dev/stdin
```

Verify the new credential without displaying it:

```bash
ARGOCD_LOGIN_STATUS="$(
  jq -cn \
    --arg password "$ARGOCD_PASSWORD" \
    '{username: "admin", password: $password}' |
    curl -sS \
      -o /dev/null \
      -w '%{http_code}' \
      -H 'Content-Type: application/json' \
      --data-binary @- \
      https://argocd.lab.seandre.dev/api/v1/session
)"

test "$ARGOCD_LOGIN_STATUS" = "200"
echo "Argo CD login verified"
```

Remove the obsolete bootstrap Secret only after the login succeeds:

```bash
kubectl -n argocd delete secret argocd-initial-admin-secret \
  --ignore-not-found
```

Deleting the bootstrap Secret does not delete or rotate `argocd-secret`.

## 4. Create the Stable Grafana Secret

Create or update the stable Secret from the password already stored in the shell variable. Server-side apply avoids the client-side `last-applied-configuration` annotation, which would otherwise duplicate encoded Secret data into metadata.

```bash
kubectl -n monitoring create secret generic grafana-admin-credentials \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$GRAFANA_PASSWORD" \
  --dry-run=client \
  -o json |
  jq '
    .metadata.labels = {
      "app.kubernetes.io/managed-by": "manual",
      "app.kubernetes.io/part-of": "homelab-monitoring"
    }
    | .metadata.annotations = {
      "homelab.seandre.dev/credential-source": "stable-manual-secret"
    }
  ' |
  kubectl apply \
    --server-side \
    --force-conflicts \
    --field-manager=homelab-credentials \
    -f -
```

Confirm only safe metadata:

```bash
kubectl -n monitoring get secret grafana-admin-credentials -o json |
  jq '{
    name: .metadata.name,
    owners: (.metadata.ownerReferences // [] | length),
    keys: (.data | keys),
    hasClientSideApplyAnnotation:
      (.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"] != null)
  }'
```

Expected results are zero owners, keys `admin-password` and `admin-user`, and `hasClientSideApplyAnnotation: false`.

## 5. Configure Grafana to Consume the Stable Secret

Edit the `grafana:` values in `kubernetes/clusters/homelab/monitoring.yaml`:

```yaml
        grafana:
          enabled: true
          admin:
            existingSecret: grafana-admin-credentials
            userKey: admin-user
            passwordKey: admin-password
          ingress:
            enabled: true
```

Do not add `adminPassword` to Git-tracked Helm values.

Render the exact pinned chart and the cluster Kustomization:

```bash
DOCKER_CONFIG=/tmp/homelab-empty-docker-config \
HELM_REGISTRY_CONFIG=/tmp/homelab-helm-registry.json \
helm template kube-prometheus-stack \
  oci://ghcr.io/prometheus-community/charts/kube-prometheus-stack \
  --version 87.3.0 \
  --namespace monitoring \
  --set grafana.admin.existingSecret=grafana-admin-credentials \
  --set grafana.admin.userKey=admin-user \
  --set grafana.admin.passwordKey=admin-password |
  grep -A3 -B3 grafana-admin-credentials

kubectl kustomize kubernetes/clusters/homelab >/dev/null
git diff --check
```

The render should reference `grafana-admin-credentials` for `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD`, and the Grafana sidecar reload credentials. It should not render a chart-owned administrator Secret.

## 6. Commit and Reconcile

Commit the non-secret wiring and documentation. The Kubernetes Secret itself remains outside Git until the Sealed Secrets workflow is completed.

```bash
git add \
  kubernetes/clusters/homelab/monitoring.yaml \
  docs/30-operations/02-troubleshooting.md \
  docs/30-operations/03-stable-admin-credentials.md \
  docs/00-overview/00-documentation-order.md \
  docs-site/docusaurus/sidebars.js \
  README.md

git diff --cached --check
git diff --cached
git commit -m "use stable admin credential secrets"
git push origin main
```

Force Argo CD to refresh the root and monitoring applications:

```bash
kubectl -n argocd annotate \
  application/homelab \
  application/homelab-monitoring \
  argocd.argoproj.io/refresh=hard \
  --overwrite
```

Wait for reconciliation and the Grafana rollout:

```bash
kubectl -n argocd get applications -w

kubectl -n monitoring rollout status \
  deployment/kube-prometheus-stack-grafana \
  --timeout=300s
```

Confirm the Deployment consumes the stable Secret:

```bash
kubectl -n monitoring get deployment kube-prometheus-stack-grafana \
  -o yaml |
  grep -A3 -B3 grafana-admin-credentials
```

The old chart-generated `kube-prometheus-stack-grafana` Secret is obsolete after the rollout. Allow Argo CD to prune it rather than deleting it before the new Deployment becomes ready.

## 7. Clear Shell State

Remove plaintext and hashes from the current shell after validation:

```bash
unset GRAFANA_PASSWORD
unset ARGOCD_PASSWORD
unset ARGOCD_HASH
unset ARGOCD_MTIME
unset ARGOCD_LOGIN_STATUS
```

Do not save this shell session or its environment to a diagnostic bundle.

## 8. Retrieve Credentials Later

The username for both services is `admin`. Prefer Keychain Access because it does not print the password into a terminal.

For a private terminal-only recovery, these commands print the password and should be used sparingly:

```bash
security find-generic-password \
  -a admin -s argocd.lab.seandre.dev -w

security find-generic-password \
  -a admin -s grafana.lab.seandre.dev -w
```

Clear the terminal afterward and never paste the output into chat, Git, or logs.

## 9. Recreate a Missing Secret

If `grafana-admin-credentials` is deleted but the Keychain entry remains, reload the password without printing it and repeat the server-side Secret creation from Step 4:

```bash
GRAFANA_PASSWORD="$(
  security find-generic-password \
    -a admin -s grafana.lab.seandre.dev -w
)"
```

If the Argo CD administrator password must be restored, load it from Keychain, regenerate its bcrypt hash, and patch only `admin.password` and `admin.passwordMtime` as shown in Step 3. Do not replace `server.secretkey` unless intentionally invalidating every existing Argo CD session during disaster recovery.

## 10. Disaster-Recovery Boundary

The manual Secrets in this tutorial are stable but remain cluster-local. For rebuild recovery:

1. keep both plaintext passwords in the preferred password manager;
2. complete the Sealed Secrets deployment and key-backup exercise;
3. seal `grafana-admin-credentials` and, if deliberately included in that design, the required Argo CD Secret fields;
4. test offline decryption with the backed-up sealing key; and
5. document the order in which sealing keys, encrypted Secrets, Argo CD, and monitoring are restored.

Never commit an unencrypted export of `argocd-secret` or `grafana-admin-credentials`.

## Upstream References

- [Argo CD FAQ: reset the administrator password](https://argo-cd.readthedocs.io/en/latest/faq/#i-forgot-the-admin-password-how-do-i-reset-it)
- [Argo CD getting started: remove the initial administrator Secret](https://argo-cd.readthedocs.io/en/stable/getting_started/#4-login-using-the-cli)
- [kube-prometheus-stack chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Grafana Helm chart values](https://github.com/grafana/helm-charts/blob/main/charts/grafana/values.yaml)
- [Sealed Secrets documentation](https://github.com/bitnami-labs/sealed-secrets)
