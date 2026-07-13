# Optional 03: Sealed Secrets and Stable Grafana Credentials

Verified 2026-07-10 with Sealed Secrets Helm chart `2.18.6` and controller/CLI `0.37.0`.

This tutorial replaces Grafana's render-time random admin password with one stable credential whose encrypted form can be reconciled through Git. It is a learning exercise: follow the steps yourself, stop at every checkpoint, and keep the three rollout commits separate. The examples match this repository's Argo CD app-of-apps layout.

This guide does **not** authorize committing plaintext credentials, applying the example manifests on someone else's behalf, or treating Git encryption as a complete enterprise secret-management system.

## Before You Begin

You need:

- access to the homelab repository and cluster;
- `kubectl`, `helm`, `openssl`, and Git;
- a password manager that can store both a password and an encrypted file attachment;
- a protected workstation with full-disk encryption;
- `KUBECONFIG` pointing at `~/.kube/k8s-homelab.yaml`.

Start in the repository root and make sure you are targeting the homelab:

```bash
cd ~/Developer/k8s-homelab
export KUBECONFIG="$HOME/.kube/k8s-homelab.yaml"
kubectl config current-context
kubectl get nodes
git status --short
```

Expected result: the intended context is selected, all nodes are `Ready`, and you understand every existing Git change. Do not overwrite unrelated work.

**Checkpoint:** continue only when you can identify the target cluster and the working tree is safe to edit.

## 1. Understand the Current Password Rotation

The Grafana chart can generate a password with Helm's `randAlphaNum` function when no fixed password or existing Secret is supplied. That function runs while Helm templates are rendered; it is not a password-rotation controller.

Argo CD repeatedly renders the kube-prometheus-stack chart to calculate desired state. If a render produces a new random value, Argo can see the live Secret as drifted. With automated sync and `selfHeal: true`, it may replace the live value. A hard refresh, re-render, upgrade, or other reconciliation can therefore appear to “rotate” the password. This is accidental render/reconciliation behavior, not a Grafana password policy, audit event, or deliberate rotation workflow.

Measure the current password without printing it:

```bash
kubectl -n monitoring get secret kube-prometheus-stack-grafana \
  -o jsonpath='{.data.admin-password}' \
  | base64 --decode \
  | openssl dgst -sha256
```

On macOS, `base64 --decode` is supported by the system tool. The output is only a SHA-256 digest. It should look like:

```text
SHA2-256(stdin)= 0123456789abcdef...
```

Security note: a hash avoids displaying the password, but it is still a fingerprint. Do not publish hashes of weak or reused passwords. Never add `set -x` to a shell handling secrets.

**Checkpoint:** you can explain why a changing digest would show reconciliation drift, not a declared rotation schedule.

## 2. Build the Threat Model

A Kubernetes `Secret` is normally only base64-encoded in YAML. Base64 is reversible encoding, not encryption. Anyone who can read a Secret manifest can recover its values, and anyone who can read the live Secret through the Kubernetes API can usually recover them too. Encryption at rest for the Kubernetes datastore is a separate cluster configuration and does not make plaintext Secret YAML safe for Git.

Keep all of the following outside Git:

- passwords, tokens, and unsealed Kubernetes Secret manifests;
- Sealed Secrets controller private/sealing keys and their backups;
- kubeconfigs, client certificates, SSH private keys, and password-manager exports;
- shell transcripts, clipboard histories, screenshots, and temporary files containing plaintext.

Sealed Secrets protects secret values while they are stored in Git or moved through an untrusted path. It does not protect against:

- cluster administrators or identities allowed to read Secrets;
- a compromised controller or Kubernetes control plane;
- a compromised Grafana pod or another workload able to read/mount the Secret;
- credentials exposed in logs, process arguments, shell history, backups, or a password manager;
- an attacker authorized to change the GitOps source, unless review and deployment policy stop the change.

The security boundary is therefore “encrypted outside the destination cluster,” not “unreadable to the cluster.” Use Kubernetes RBAC, workload isolation, Git review, audit logs, and least privilege around it.

**Checkpoint:** continue only if the password manager and protected workstation are acceptable places for plaintext and the Git repository is not.

## 3. Learn the Architecture

Sealed Secrets uses asymmetric encryption:

1. The controller generates a public/private sealing-key pair in the destination cluster.
2. `kubeseal` downloads the public certificate. The certificate is safe to distribute.
3. `kubeseal` encrypts each Secret value locally into a `SealedSecret` custom resource.
4. Argo CD applies that encrypted object.
5. Only a controller holding a matching private key can decrypt it and create the ordinary Kubernetes Secret.

With strict scope, the Secret name and namespace are authenticated inputs to encryption. This tutorial seals `grafana-admin-credentials` specifically for `monitoring`; renaming it or moving it causes decryption to fail. Strict is the default, and this guide also spells out `--scope strict` so the intent is visible.

The destination cluster matters. A certificate fetched from another cluster produces ciphertext this cluster cannot decrypt. Conversely, loss of all controller private keys means old ciphertext cannot be recovered unless the underlying application credential can be replaced.

The main alternatives solve related but different problems:

| Approach | Where Git stores data | Where plaintext originates | Best fit |
|---|---|---|---|
| Sealed Secrets | Public-key ciphertext | Operator workstation, then the cluster | Simple GitOps learning and small clusters |
| SOPS | Encrypted YAML, commonly using age/KMS | Any authorized decryptor in CI or GitOps | Flexible multi-file encryption with managed key options |
| External Secrets + Vault/cloud manager | References only | External secret manager | Central ownership, dynamic credentials, policy, and audit |

Sealed Secrets is practical here because Argo CD already owns desired state, the homelab is a single destination cluster, and the exercise teaches encryption, Git staging, key custody, rotation, and recovery without first operating an external Vault. The enterprise target remains an external identity and secret system.

Read the upstream [Sealed Secrets documentation](https://github.com/bitnami/sealed-secrets) for scopes, renewal, backup, and recovery details.

**Checkpoint:** you can distinguish the public certificate, the cluster-held private keys, the encrypted `SealedSecret`, and the decrypted Kubernetes `Secret`.

## 4. Install the Client and Controller

### Install exactly `kubeseal` 0.37.0

Homebrew's normal formula may move to a newer version. For a repeatable macOS install, download the release archive and checksum list from the official [v0.37.0 release](https://github.com/bitnami/sealed-secrets/releases/tag/v0.37.0):

```bash
KUBESEAL_VERSION=0.37.0
KUBESEAL_ARCH=darwin-arm64
download_dir="$(mktemp -d -t kubeseal-download.XXXXXX)"
archive_name="kubeseal-${KUBESEAL_VERSION}-${KUBESEAL_ARCH}.tar.gz"
archive="$download_dir/$archive_name"
checksum_file="$download_dir/sealed-secrets_${KUBESEAL_VERSION}_checksums.txt"
curl -fL \
  "https://github.com/bitnami/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/${archive_name}" \
  -o "$archive"
curl -fL \
  "https://github.com/bitnami/sealed-secrets/releases/download/v${KUBESEAL_VERSION}/sealed-secrets_${KUBESEAL_VERSION}_checksums.txt" \
  -o "$checksum_file"
expected_sha256="$(awk -v file="$archive_name" '$2 == file {print $1}' "$checksum_file")"
test -n "$expected_sha256"
printf '%s  %s\n' "$expected_sha256" "$archive" | shasum -a 256 -c -
tar -tzf "$archive"
```

Do not continue if checksum verification fails. After inspecting the archive listing, install the binary and remove the archive:

```bash
extract_dir="$(mktemp -d -t kubeseal-extract.XXXXXX)"
tar -xzf "$archive" -C "$extract_dir"
mkdir -p "$HOME/.local/bin"
install -m 0755 "$extract_dir/kubeseal" "$HOME/.local/bin/kubeseal"
rm -rf "$extract_dir" "$download_dir"
unset archive archive_name checksum_file download_dir expected_sha256
kubeseal --version
```

Expected result: checksum verification reports `OK`, the archive contains a `kubeseal` binary, and the version command reports:

```text
kubeseal version: 0.37.0
```

Intel Macs use `KUBESEAL_ARCH=darwin-amd64`. Ensure `$HOME/.local/bin` is on `PATH`. The checksum protects against a corrupt or mismatched download; for stronger release provenance, also follow the release's Cosign signature-verification instructions.

### Define the controller as an Argo CD child application

Create `kubernetes/clusters/homelab/sealed-secrets.yaml` with this complete example:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: homelab-sealed-secrets
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://bitnami.github.io/sealed-secrets
    chart: sealed-secrets
    targetRevision: 2.18.6
    helm:
      releaseName: sealed-secrets
      values: |
        fullnameOverride: sealed-secrets-controller

        image:
          tag: 0.37.0

        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 200m
            memory: 128Mi
  destination:
    server: https://kubernetes.default.svc
    namespace: kube-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - SkipDryRunOnMissingResource=true
```

Chart `2.18.6` has application version `0.37.0`; the explicit image tag makes both pins reviewable. The fixed `fullnameOverride` also matches `kubeseal`'s default controller name.

Add the child application to `kubernetes/clusters/homelab/kustomization.yaml`:

```yaml
resources:
  - root-application.yaml
  - apps.yaml
  - infrastructure.yaml
  - monitoring.yaml
  - sealed-secrets.yaml
```

Render locally before committing:

```bash
kubectl kustomize kubernetes/clusters/homelab >/dev/null
git diff --check
git diff -- kubernetes/clusters/homelab
```

Commit only the controller application as rollout commit 1:

```bash
git add kubernetes/clusters/homelab/sealed-secrets.yaml \
  kubernetes/clusters/homelab/kustomization.yaml
git diff --cached --check
git diff --cached
git commit -m 'Add Sealed Secrets controller application'
git push
```

Wait for Argo CD, then validate every layer:

```bash
kubectl -n argocd get application homelab-sealed-secrets
kubectl get crd sealedsecrets.bitnami.com
kubectl -n kube-system rollout status \
  deployment/sealed-secrets-controller --timeout=300s
kubectl -n kube-system get pods \
  -l app.kubernetes.io/name=sealed-secrets
kubeseal --controller-name sealed-secrets-controller \
  --controller-namespace kube-system \
  --fetch-cert >/dev/null
```

Expected result: the Argo application is `Synced`/`Healthy`, the CRD exists, the deployment completes its rollout, a controller pod is `Running`, and certificate retrieval exits successfully.

**Checkpoint:** do not create encrypted credentials until all five checks succeed.

## 5. Protect the Root of Trust

The controller private keys are Kubernetes Secrets labeled `sealedsecrets.bitnami.com/sealed-secrets-key`. Losing all keys makes existing `SealedSecret` ciphertext unrecoverable. Exposing them allows an attacker to decrypt ciphertext copied from Git history.

Export all current sealing-key Secrets into a protected temporary directory:

```bash
umask 077
backup_dir="$(mktemp -d -t sealed-secrets-backup.XXXXXX)"
chmod 700 "$backup_dir"
backup_file="$backup_dir/homelab-sealing-keys-$(date +%Y%m%dT%H%M%S).yaml"
cleanup_backup_dir() {
  rm -f "$backup_file"
  rmdir "$backup_dir" 2>/dev/null || true
}
trap cleanup_backup_dir EXIT HUP INT TERM
kubectl -n kube-system get secret \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml >"$backup_file"
chmod 600 "$backup_file"
test "$(kubectl -n kube-system get secret \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o name | wc -l | tr -d ' ')" -gt 0
ls -l "$backup_file"
```

Security warning: `backup_file` contains private keys even though its data fields look base64-encoded. Do not run `cat`, paste it into chat, attach it to an issue, or place it anywhere under the repository.

Import the file as an encrypted attachment in the password-manager entry for this cluster. Record the cluster, controller namespace/name, export time, and number of key Secrets. After confirming the attachment can be downloaded, securely remove the temporary directory using the deletion facilities appropriate to your encrypted filesystem:

```bash
cleanup_backup_dir
trap - EXIT HUP INT TERM
unset backup_file backup_dir
```

On SSDs, overwriting a file is not a reliable secure-erasure primitive. Full-disk encryption, short-lived files, restrictive permissions, and removal are the relevant controls.

The controller creates a new sealing key every 30 days by default. It retains old keys so old ciphertext still decrypts; this is key renewal, not automatic retirement. Renewal does **not** change Grafana's password. Refresh the encrypted backup whenever this count increases:

```bash
kubectl -n kube-system get secret \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -L sealedsecrets.bitnami.com/sealed-secrets-key
```

**Checkpoint:** the password manager contains a verified encrypted attachment, the temporary export is gone, and you have a reminder to refresh the attachment after key renewal.

## 6. Generate and Seal the Grafana Credential

Create a protected working directory and install a cleanup trap. Keep this shell open until the section is complete:

```bash
umask 077
secret_dir="$(mktemp -d -t grafana-secret.XXXXXX)"
chmod 700 "$secret_dir"
cleanup_secret_dir() {
  rm -f "$secret_dir/admin-password" \
    "$secret_dir/admin-password.tmp" \
    "$secret_dir/controller-cert.pem" \
    "$secret_dir/grafana-admin-credentials.yaml"
  rmdir "$secret_dir" 2>/dev/null || true
}
trap cleanup_secret_dir EXIT HUP INT TERM
openssl rand -base64 32 >"$secret_dir/admin-password"
chmod 600 "$secret_dir/admin-password"
test "$(wc -c <"$secret_dir/admin-password" | tr -d ' ')" -eq 45
```

This generates 32 random bytes as 44 base64 characters plus a newline. `kubectl --from-file` preserves file bytes, so remove the newline explicitly while preserving the random value:

```bash
tr -d '\n' <"$secret_dir/admin-password" >"$secret_dir/admin-password.tmp"
mv "$secret_dir/admin-password.tmp" "$secret_dir/admin-password"
chmod 600 "$secret_dir/admin-password"
test "$(wc -c <"$secret_dir/admin-password" | tr -d ' ')" -eq 44
```

Security warning: the plaintext now exists in one local file. Do not print it, pass it as a command-line argument, or enable shell tracing. Save it in the password manager as the Grafana admin credential **before** sealing. Use the manager's secure import/attachment feature or a CLI that accepts values on standard input; avoid clipboard history. Confirm the stored value has exactly 44 characters.

Fetch the public certificate and produce the encrypted resource. The ordinary Secret is constructed by `kubectl` and piped directly to `kubeseal`; it is never written to disk:

```bash
kubeseal --controller-name sealed-secrets-controller \
  --controller-namespace kube-system \
  --fetch-cert >"$secret_dir/controller-cert.pem"

kubectl -n monitoring create secret generic grafana-admin-credentials \
  --from-literal=admin-user=admin \
  --from-file=admin-password="$secret_dir/admin-password" \
  --dry-run=client -o json \
  | kubeseal --cert "$secret_dir/controller-cert.pem" \
      --scope strict --format yaml \
  >"$secret_dir/grafana-admin-credentials.yaml"
chmod 600 "$secret_dir/grafana-admin-credentials.yaml"
```

Inspect only structure and metadata:

```bash
kubectl apply --dry-run=client \
  -f "$secret_dir/grafana-admin-credentials.yaml" >/dev/null
kubeseal --validate \
  --controller-name sealed-secrets-controller \
  --controller-namespace kube-system \
  <"$secret_dir/grafana-admin-credentials.yaml"
kubectl create --dry-run=client \
  -f "$secret_dir/grafana-admin-credentials.yaml" \
  -o jsonpath='{.kind}{" "}{.metadata.namespace}{"/"}{.metadata.name}{"\n"}'
```

Expected result:

```text
SealedSecret monitoring/grafana-admin-credentials
```

Prove that the exact password is absent without printing it:

```bash
if grep -Fq -f "$secret_dir/admin-password" \
  "$secret_dir/grafana-admin-credentials.yaml"; then
  echo 'ERROR: plaintext found; do not commit this file' >&2
  false
else
  echo 'OK: exact plaintext password is absent'
fi
grep -E '^(apiVersion:|kind:|metadata:|  name:|  namespace:|spec:|  encryptedData:|    admin-(user|password):)' \
  "$secret_dir/grafana-admin-credentials.yaml"
```

The second command prints key names and ciphertext lines, never decrypted values. The encrypted values should begin with long ciphertext such as `Ag...`; they will differ every time.

**Checkpoint:** the password is safely stored in the password manager, validation succeeds, strict name/namespace are correct, and the exact plaintext test reports `OK`.

## 7. Create the GitOps Secrets Layer

Create a dedicated child application at `kubernetes/clusters/homelab/secrets.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: homelab-secrets
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/seandre/k8s-homelab.git
    targetRevision: main
    path: kubernetes/clusters/homelab/secrets
  destination:
    server: https://kubernetes.default.svc
    namespace: monitoring
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
      - SkipDryRunOnMissingResource=true
```

Create `kubernetes/clusters/homelab/secrets/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - grafana-admin-credentials.yaml
```

Copy only the validated encrypted object into place:

```bash
mkdir -p kubernetes/clusters/homelab/secrets
install -m 0600 "$secret_dir/grafana-admin-credentials.yaml" \
  kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml
chmod 644 kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml
```

Add `secrets.yaml` to the root `kubernetes/clusters/homelab/kustomization.yaml`. Its final resources list should include:

```yaml
resources:
  - root-application.yaml
  - apps.yaml
  - infrastructure.yaml
  - monitoring.yaml
  - sealed-secrets.yaml
  - secrets.yaml
```

`CreateNamespace` lets Argo create `monitoring` during a clean rebuild. Server-side apply avoids large-resource annotation limits. Self-heal corrects drift, pruning removes resources deleted from Git, and `SkipDryRunOnMissingResource` allows the root reconciliation to encounter a `SealedSecret` before its CRD discovery cache is current. It is not a substitute for waiting for the controller during this initial rollout.

Validate before staging:

```bash
kubectl kustomize kubernetes/clusters/homelab >/dev/null
kubectl kustomize kubernetes/clusters/homelab/secrets \
  | kubeseal --validate \
      --controller-name sealed-secrets-controller \
      --controller-namespace kube-system
git diff --check
if rg --hidden --glob '!.git/**' --fixed-strings \
  --file "$secret_dir/admin-password" .; then
  echo 'ERROR: plaintext is present in the worktree' >&2
  false
else
  echo 'OK: plaintext is absent from the worktree'
fi
```

Review the encrypted file. It must be a `SealedSecret`, never a `Secret`:

```bash
git diff -- kubernetes/clusters/homelab
git add kubernetes/clusters/homelab/secrets.yaml \
  kubernetes/clusters/homelab/secrets/kustomization.yaml \
  kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml \
  kubernetes/clusters/homelab/kustomization.yaml
git diff --cached --check
git diff --cached
git commit -m 'Add encrypted Grafana admin credentials'
git push
```

This is rollout commit 2. After the push, wait for the encrypted object and generated Secret:

```bash
kubectl -n argocd get application homelab-secrets
kubectl -n monitoring wait \
  --for=condition=Synced sealedsecret/grafana-admin-credentials \
  --timeout=180s
kubectl -n monitoring get sealedsecret grafana-admin-credentials
kubectl -n monitoring get secret grafana-admin-credentials \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}' | sort
```

Expected keys are exactly:

```text
admin-password
admin-user
```

Do not print either decoded value. Now delete plaintext temporary material; the `EXIT` trap also covers an interrupted shell:

```bash
cleanup_secret_dir
trap - EXIT HUP INT TERM
unset secret_dir
```

**Checkpoint:** `homelab-secrets` is healthy, the `SealedSecret` is synced, the generated Secret has both expected keys, and no plaintext working file remains.

## 8. Connect Grafana to the Stable Secret

Only after the previous checkpoint, edit the `grafana:` values inside `kubernetes/clusters/homelab/monitoring.yaml`:

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

Keep the existing ingress block below it unchanged. The indentation matters because these are Helm values embedded in the Argo `Application`.

Never put `adminPassword:` directly in this Git-tracked values block. Helm values are desired-state source, and a plaintext password there would be retained in Git history and visible through Argo/Helm tooling.

Render and inspect the chart using the exact pinned version:

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts
helm repo update
helm template kube-prometheus-stack \
  prometheus-community/kube-prometheus-stack \
  --version 87.3.0 \
  --namespace monitoring \
  --set grafana.admin.existingSecret=grafana-admin-credentials \
  --set grafana.admin.userKey=admin-user \
  --set grafana.admin.passwordKey=admin-password \
  >/dev/null
kubectl kustomize kubernetes/clusters/homelab >/dev/null
git diff --check
git diff -- kubernetes/clusters/homelab/monitoring.yaml
```

Commit this wiring separately as rollout commit 3:

```bash
git add kubernetes/clusters/homelab/monitoring.yaml
git diff --cached --check
git diff --cached
git commit -m 'Use stable Grafana admin credentials'
git push
```

The chart-generated `kube-prometheus-stack-grafana` Secret becomes obsolete when `existingSecret` is set. Argo CD's pruning should remove it once it is no longer in rendered desired state; do not delete it manually before the new Secret exists. Confirm the deployment references the new name:

```bash
kubectl -n monitoring rollout status \
  deployment/kube-prometheus-stack-grafana --timeout=300s
kubectl -n monitoring get deployment kube-prometheus-stack-grafana \
  -o yaml | grep -A3 -B3 grafana-admin-credentials
kubectl -n monitoring get secret kube-prometheus-stack-grafana \
  --ignore-not-found
```

Expected result: Grafana rolls out with references to `grafana-admin-credentials`; the obsolete Secret eventually produces no output.

**Checkpoint:** the monitoring application is `Synced`/`Healthy`, the deployment uses the stable Secret, and Grafana is reachable.

## 9. Validate Stability

First inspect health and keys without revealing values:

```bash
kubectl -n argocd get application homelab-secrets homelab-monitoring
kubectl -n monitoring describe sealedsecret grafana-admin-credentials
kubectl -n monitoring get secret grafana-admin-credentials \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}' | sort
```

Log in to `https://grafana.lab.home.arpa` as `admin` using the password-manager entry. Do not copy the password into terminal history.

Capture a digest without printing the password:

```bash
grafana_secret_hash() {
  kubectl -n monitoring get secret grafana-admin-credentials \
    -o jsonpath='{.data.admin-password}' \
    | base64 --decode \
    | openssl dgst -sha256
}
before_hash="$(grafana_secret_hash)"
printf '%s\n' "$before_hash"
```

Exercise reconciliation and a pod replacement:

```bash
kubectl -n argocd annotate application homelab-secrets \
  argocd.argoproj.io/refresh=hard --overwrite
kubectl -n argocd annotate application homelab-monitoring \
  argocd.argoproj.io/refresh=hard --overwrite
kubectl -n monitoring delete sealedsecret grafana-admin-credentials
kubectl -n monitoring wait \
  --for=condition=Synced sealedsecret/grafana-admin-credentials \
  --timeout=180s
kubectl -n monitoring wait \
  --for=create secret/grafana-admin-credentials \
  --timeout=180s
kubectl -n monitoring delete pod \
  -l app.kubernetes.io/name=grafana
kubectl -n monitoring rollout status \
  deployment/kube-prometheus-stack-grafana --timeout=300s
after_hash="$(grafana_secret_hash)"
printf '%s\n' "$after_hash"
test "$before_hash" = "$after_hash"
```

Deleting the Git-managed `SealedSecret` deliberately creates drift. Its owner reference normally removes the generated Secret too; Argo self-heal recreates the encrypted object and the controller recreates the same Secret. Wait for both before replacing the Grafana pod. Expected result: `test` exits zero, both printed hashes match, applications return to healthy, and the password-manager credential still logs in after pod replacement.

### Troubleshooting

**The CRD is missing**

```bash
kubectl -n argocd get application homelab-sealed-secrets
kubectl -n kube-system get pods -l app.kubernetes.io/name=sealed-secrets
kubectl get crd sealedsecrets.bitnami.com
```

Fix the controller application first. Do not bypass Git by applying an unpinned CRD from the internet.

**Unsealing fails**

```bash
kubectl -n monitoring describe sealedsecret grafana-admin-credentials
kubectl -n kube-system logs deployment/sealed-secrets-controller --tail=100
kubeseal --validate \
  --controller-name sealed-secrets-controller \
  --controller-namespace kube-system \
  <kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml
```

Events such as `no key could decrypt secret` usually mean the file was sealed with a different cluster certificate or the matching private key was lost.

**Name or namespace scope is wrong**

Strict scope requires both objects to be `monitoring/grafana-admin-credentials`. Do not edit metadata after sealing. Recreate the ciphertext from the password-manager credential with the correct `--namespace`, name, and current cluster certificate.

**The Secret changed but Grafana accepts only the old password**

Grafana's admin password setting initializes or provisions the local administrator; an already-initialized Grafana database can retain its prior password. First confirm the Secret hash and deployment reference. Then use Grafana's documented administrative password-reset procedure during a maintenance window, supplying the new password from the password manager without logging it. Updating a Kubernetes Secret alone is not proof that the application database changed. See the official [Grafana server CLI documentation](https://grafana.com/docs/grafana/latest/administration/cli/#reset-admin-password).

**Checkpoint:** reconciliation, self-heal, and pod replacement preserve the Secret digest and the tested login.

## 10. Practice Deliberate Rotation and Recovery

### Rotate the application password

Application-password rotation is an intentional value change. Repeat the protected-directory workflow from section 6, generate a new 32-byte password, store it in the password manager, seal it with the current public certificate under the same strict name/namespace, and replace only `kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml`.

Before committing, validate it and repeat the pattern-file checks from sections 6 and 7 to prove the new plaintext is absent from both the encrypted manifest and worktree:

```bash
kubeseal --validate \
  --controller-name sealed-secrets-controller \
  --controller-namespace kube-system \
  <kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml
git diff --check
git diff -- kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml
```

Commit the encrypted change only:

```bash
git add kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml
git diff --cached --check
git diff --cached
git commit -m 'Rotate Grafana admin credential'
git push
```

Wait for the generated Secret digest to change. If Grafana's existing database does not accept the new credential, follow its administrative reset procedure during the same controlled maintenance window. Test the new login before retiring the old password-manager version, and remove all plaintext temporary material.

This is distinct from sealing-key renewal:

- Grafana password rotation changes the credential used by a person/application.
- Sealing-key renewal creates a new encryption key for future ciphertext.
- Old sealing keys remain so existing ciphertext still decrypts.
- Neither operation automatically performs the other.

### Perform a non-destructive offline recovery exercise

Download a **copy** of the encrypted sealing-key backup from the password manager into a new protected directory. Also copy the Git-tracked encrypted Grafana file there. Never run recovery against the live Secret and never write recovered plaintext into the repository.

```bash
umask 077
recovery_dir="$(mktemp -d -t sealed-recovery.XXXXXX)"
chmod 700 "$recovery_dir"
cleanup_recovery_dir() {
  rm -f "$recovery_dir/recovered-secret.yaml" \
    "$recovery_dir/grafana-admin-credentials.yaml" \
    "$recovery_dir/sealing-keys.yaml"
  rmdir "$recovery_dir" 2>/dev/null || true
}
trap cleanup_recovery_dir EXIT HUP INT TERM
echo "Import the password-manager attachment as $recovery_dir/sealing-keys.yaml"
install -m 0600 \
  kubernetes/clusters/homelab/secrets/grafana-admin-credentials.yaml \
  "$recovery_dir/grafana-admin-credentials.yaml"
```

After using the password manager to place `sealing-keys.yaml` at that exact path, check permissions and recover locally:

```bash
test -f "$recovery_dir/sealing-keys.yaml"
chmod 600 "$recovery_dir/sealing-keys.yaml"
kubeseal --recovery-unseal \
  --recovery-private-key "$recovery_dir/sealing-keys.yaml" \
  <"$recovery_dir/grafana-admin-credentials.yaml" \
  >"$recovery_dir/recovered-secret.yaml"
chmod 600 "$recovery_dir/recovered-secret.yaml"
kubectl create --dry-run=client \
  -f "$recovery_dir/recovered-secret.yaml" \
  -o jsonpath='{.kind}{" "}{.metadata.namespace}{"/"}{.metadata.name}{"\n"}'
```

Expected result:

```text
Secret monitoring/grafana-admin-credentials
```

Do not display `recovered-secret.yaml`; it contains plaintext encoded as base64. Successful metadata inspection proves that the backup can decrypt the Git ciphertext. Remove all recovery material immediately:

```bash
cleanup_recovery_dir
trap - EXIT HUP INT TERM
unset recovery_dir
```

For a real cluster rebuild, restore in this order:

1. Rebuild Kubernetes and install the kubeconfig, but do not bootstrap the Argo CD root application yet.
2. Download the protected key backup, verify its restrictive permissions, and apply all backed-up sealing-key Secret objects into `kube-system` as an explicit break-glass restore.
3. Remove the local key file, then bootstrap Argo CD. The controller starts with the restored keys already present.
4. If the controller was already running when keys were restored, restart `deployment/sealed-secrets-controller` so it reloads them.
5. Confirm the controller publishes the expected certificate and can validate existing ciphertext.
6. Let Argo CD reconcile the `homelab-secrets` application and its `SealedSecret` resources.
7. Let dependent applications such as monitoring roll out and test their credentials.

On a fresh cluster, use this protected restore pattern after obtaining the kubeconfig and before running the repository's Argo CD bootstrap command:

```bash
umask 077
restore_dir="$(mktemp -d -t sealing-key-restore.XXXXXX)"
chmod 700 "$restore_dir"
restore_file="$restore_dir/homelab-sealing-keys.yaml"
cleanup_restore_dir() {
  rm -f "$restore_file"
  rmdir "$restore_dir" 2>/dev/null || true
}
trap cleanup_restore_dir EXIT HUP INT TERM
echo "Import the password-manager attachment as $restore_file"
```

Use the password manager to place the attachment at that exact path, then restore and remove the local private-key copy before bootstrap:

```bash
test -f "$restore_file"
chmod 600 "$restore_file"
kubectl apply -f "$restore_file"
kubectl -n kube-system get secret \
  -l sealedsecrets.bitnami.com/sealed-secrets-key
cleanup_restore_dir
trap - EXIT HUP INT TERM
unset restore_file restore_dir
KUBECONFIG=~/.kube/k8s-homelab.yaml kubectl apply \
  --server-side --force-conflicts -k kubernetes/bootstrap
```

If the controller already existed before the restore, reload its key registry and wait for it:

```bash
kubectl -n kube-system rollout restart \
  deployment/sealed-secrets-controller
kubectl -n kube-system rollout status \
  deployment/sealed-secrets-controller --timeout=300s
```

Never commit the restored key manifest. The upstream [backup and recovery instructions](https://github.com/bitnami/sealed-secrets#how-can-i-do-a-backup-of-my-sealedsecrets) are authoritative for controller-version-specific details.

**Checkpoint:** recovery produces the expected Secret metadata offline, all recovered plaintext/private-key files are gone, and the rebuild order is recorded with the password-manager backup.

## 11. Connect the Lesson to Enterprise Practice

A shared local `admin` account is useful for this exercise but weak as a normal enterprise identity model. Production Grafana commonly uses OIDC/SSO for named users, group-based roles, MFA, centralized offboarding, and identity-provider audit trails. Retain a strong, vaulted break-glass local credential; restrict and alert on its use.

A natural migration path is:

1. deploy External Secrets Operator through Argo CD;
2. configure a scoped identity for Vault or a cloud secret manager;
3. store the Grafana credential in that external system;
4. commit only an `ExternalSecret` reference and policy-safe metadata;
5. verify refresh, revocation, outage, and disaster-recovery behavior;
6. rotate away from the Sealed Secrets value and remove its ciphertext after the migration is proven.

The external manager becomes the authoritative secret store and can provide centralized audit, access policy, automated rotation, and ownership. Git still declares which workload receives which reference.

Regardless of tool, mature practice requires:

- a named owner and consumer inventory for every credential;
- least-privilege access at Git, cluster, namespace, workload, and secret-manager layers;
- an explicit rotation interval and emergency-compromise procedure;
- audit logs and alerts for read, write, and break-glass use;
- tested backup, restore, revocation, and dependency startup order;
- regular removal of stale identities, keys, ciphertext, and permissions.

**Final checkpoint:** you can explain where plaintext exists, who can read it, how normal and emergency rotation differ, and how to restore service without inventing decisions during an outage.

## Rollout Checklist

- [ ] Current random-render behavior understood and hashed without disclosure.
- [ ] Threat model and out-of-Git material identified.
- [ ] `kubeseal` `0.37.0` installed from a verified release archive.
- [ ] Rollout commit 1: chart `2.18.6` controller healthy in `kube-system`.
- [ ] All sealing keys backed up as an encrypted password-manager attachment.
- [ ] Password generated in a mode-`0700` directory and saved before sealing.
- [ ] Strict `monitoring/grafana-admin-credentials` ciphertext validated.
- [ ] Rollout commit 2: only encrypted credentials reconciled and generated Secret healthy.
- [ ] Plaintext temporary material removed.
- [ ] Rollout commit 3: Grafana wired to `existingSecret` and old chart Secret pruned.
- [ ] Hash and login stable through refresh, self-heal, and pod replacement.
- [ ] Deliberate application rotation practiced.
- [ ] Offline recovery exercise completed and cleanup verified.
- [ ] Sealing-key backup refresh reminder scheduled.
