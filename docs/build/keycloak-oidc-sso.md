# Cluster-wide Keycloak OIDC/SSO

Status: implementation manifests and rollout runbook. The cluster is not
considered cut over until the credential, DNS, login, failover, and restore
gates below have passed.

This build makes Keycloak 26.7.0 the private identity provider at
`https://auth.lab.seandre.dev`. It is LAN/VPN-only: create the split-DNS record
to the Traefik VIP (`192.168.40.30`) and do not create a public A or AAAA
record. The existing Cloudflare DNS-01 ClusterIssuer can still issue a trusted
certificate without publishing the service address.

## What was implemented

The implementation is Git-owned and staged for a controlled cutover. It is not
considered operational until the runtime Secrets, private DNS, MFA enrollment,
failover tests, and isolated restore tests have been completed.

| Area | Implemented behavior |
|---|---|
| Identity provider | Keycloak 26.7.0, realm `homelab`, private URL `https://auth.lab.seandre.dev`, five-minute access tokens, 30-minute idle SSO, eight-hour maximum session. |
| Availability | Two Keycloak replicas and two CloudNativePG PostgreSQL 18 instances, hard-separated across `k8s-control-01` and `k8s-worker-01`; `k8s-worker-02` is excluded. |
| Recovery | Barman WAL/PITR to the dedicated Cloudflare R2 bucket plus encrypted daily PostgreSQL dumps to PBS. |
| Access model | `homelab-admins`, `homelab-operators`, and `homelab-viewers`; passkeys are the normal MFA path, with TOTP and recovery codes as controlled fallbacks. |
| Kubernetes | Structured k3s OIDC authentication; Headlamp receives read-only access, while only `homelab-admins` receive kubectl `cluster-admin` through the separate `kubectl` client. |
| Applications | Headlamp, Grafana Generic OAuth, and Argo CD direct OIDC are configured with client-specific callbacks, audiences, and group mappings. |
| Operations | Prometheus alerts cover replica/database health, WAL/Barman/PBS freshness, and certificate expiry. Native administrators and the certificate kubeconfig remain break-glass paths. |

## Git-owned pieces

The Argo CD root now creates two child Applications:

1. `homelab-identity-operators` installs the pinned Keycloak Operator 26.7.0,
   CloudNativePG 1.29.1, Barman Cloud Plugin 0.13.0, and
   `local-path-retain`.
2. `homelab-keycloak` creates the two-instance PostgreSQL cluster, Keycloak,
   realm import hook, network policies, monitoring, R2 physical backup, and
   PBS logical-backup CronJob.

The upstream operator release manifests are versioned URLs in
`kubernetes/infrastructure/identity-operators/kustomization.yaml`. The
Barman Cloud v0.13.0 bundle's testing image defaults are overridden there with
the published v0.13.0 plugin and sidecar images, both pinned by digest. The
CloudNativePG PostgreSQL image and the PBS client image are also pinned to
their tested release references. Before the first production sync, record the
resolved OCI digests in the change evidence and replace a tag if the registry's
published digest differs from the reviewed release.

KeycloakRealmImport is intentionally a bootstrap hook. It creates the
`homelab` realm, groups, client roles, clients, token/session policy, event
logging, SMTP configuration, group claim, and Kubernetes-role claim. Keycloak's
database becomes authoritative after creation; changing the import YAML does
not reconcile an existing realm.

## Runtime Secret contracts

Do not commit any of these Secrets or their values. Create them from the
password manager in the target namespace, then run
`scripts/validate-keycloak-secrets.sh`. The validator checks only object names
and key names and never prints Secret data.

| Namespace | Secret | Required keys |
|---|---|---|
| `keycloak` | `keycloak-bootstrap-admin` | `username`, `password` |
| `keycloak` | `keycloak-db` | `username`, `password` |
| `keycloak` | `keycloak-smtp` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_FROM_DISPLAY_NAME` |
| `keycloak` | `keycloak-r2` | `ACCESS_KEY_ID`, `ACCESS_SECRET_KEY`, `AWS_REGION` (`auto`) |
| `keycloak` | `keycloak-pbs` | `auth-id`, `server`, `datastore`, `token-secret`, `fingerprint`, `namespace`, `encryption-key` |
| `keycloak` | `keycloak-client-secrets` | `headlamp`, `grafana`, `argocd` |
| `headlamp` | `headlamp-oidc` | `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER_URL`, `OIDC_SCOPES`, `OIDC_CALLBACK_URL`, `OIDC_USE_PKCE` |
| `monitoring` | `grafana-oidc` | `client-id`, `client-secret` |
| `argocd` | `argocd-keycloak-oidc` | `client-secret` |

The Argo CD Secret must also carry the label
`app.kubernetes.io/part-of=argocd`; Argo CD uses that label when resolving the
`clientSecret` reference. The validation script checks this metadata without
printing Secret values.

The `headlamp-oidc.OIDC_CLIENT_SECRET`, `grafana-oidc.client-secret`, and
`argocd-keycloak-oidc.client-secret` values must match the corresponding
`headlamp`, `grafana`, and `argocd` entries in
`keycloak-client-secrets`. The issuer and callback values in the Headlamp
Secret must match the Git-owned client configuration.

`keycloak-db.username` must be `keycloak`, matching the CNPG initdb owner.
The PBS token is `keycloak@pbs!k3s`, has `DatastoreBackup` only on the chosen
Keycloak datastore path, and cannot read or modify other backup groups. Keep
the PBS encryption/recovery key in a separate password-manager entry from the
PBS token. Configure PBS pruning for 14 daily, 8 weekly, and 12 monthly
recovery points.

Create the R2 bucket `homelab-keycloak-postgres` and a bucket-scoped access key
before syncing the ObjectStore. Replace the account-ID placeholder in
`kubernetes/apps/keycloak/object-store.yaml`; the manifest deliberately does
not put the endpoint or credential in a Secret generated by Git.

## How to use the new system

These are the normal user and operator paths after the one-time bootstrap below.
All browser URLs require LAN or VPN access. Automatic OAuth redirection is
intentionally disabled during the soak, so choose the Keycloak/SSO button on
each service's login page.

### One-time activation

Complete the following before asking users to log in:

1. Add private split-DNS for `auth.lab.seandre.dev` to `192.168.40.30`, with
   no public A or AAAA record, and wait for the `keycloak-private-tls`
   certificate to become ready.
2. Create the Secrets in the [runtime Secret contracts](#runtime-secret-contracts)
   from the password manager. Never commit them or put their values in shell
   history. Replace the R2 account-ID placeholder in the ObjectStore manifest.
3. Run the names-and-keys check without printing Secret data:

   ```sh
   ./scripts/validate-keycloak-secrets.sh
   ```

4. Commit and push the reviewed changes. Argo CD will reconcile
   `homelab-identity-operators` first and `homelab-keycloak` second. Check the
   applications and workloads:

   ```sh
   kubectl -n argocd get applications homelab-identity-operators homelab-keycloak
   kubectl -n keycloak get pods -o wide
   kubectl -n keycloak get cluster,scheduledbackup,backup,objectstore
   kubectl get nodes -L homelab.seandre.dev/identity
   ```

5. Apply the Ansible k3s change only after the control-plane host can resolve
   and verify the Keycloak issuer:

   ```sh
   ansible-playbook -i ansible/inventory/hosts.ini ansible/playbooks/install-k3s.yml
   ```

   Keep the certificate kubeconfig available until OIDC login and the outage
   test pass.
6. With the vaulted bootstrap administrator, create normal users in the
   `homelab` realm, verify their email, add each user to exactly the intended
   group, and enroll a passkey. Keep the bootstrap administrator in `master`
   for break-glass use only.
7. Complete the R2 PITR and PBS restore drills, then perform the individual
   Headlamp, kubectl, Grafana, and Argo CD login tests before enabling any
   automatic redirect or removing Dex.

### Browser sign-in

| Service | URL | Normal sign-in | Resulting access |
|---|---|---|---|
| Keycloak account/security | `https://auth.lab.seandre.dev/realms/homelab/account` | Use the `homelab` realm with password plus passkey. | Change credentials, enroll MFA, and review account/security settings. |
| Headlamp | `https://headlamp.lab.seandre.dev` | Choose OIDC/Keycloak login. | All three homelab groups get workload/log read access; no Secrets, exec, or mutations. |
| Grafana | `https://grafana.lab.seandre.dev` | Choose Keycloak login. | Admins → Grafana Admin, operators → Editor, viewers → Viewer. |
| Argo CD | `https://argocd.lab.seandre.dev` | Choose `LOG IN VIA KEYCLOAK`. | Admins → `role:admin`; operators → application get/sync/log access; viewers → read-only. |

Grafana automatic sign-up is disabled. If a newly created Keycloak user is
rejected by Grafana, a vaulted Grafana administrator must first provision or
associate that Grafana user; do not enable public sign-up as an ad-hoc fix.

To end a browser session, log out of the application and then sign out of the
Keycloak session if the browser is shared. The Keycloak session is idle for 30
minutes and expires after eight hours at most; access tokens expire after five
minutes.

### kubectl login

Use the public `kubectl` client with Authorization Code + PKCE. The supported
loopback callback is `http://localhost:8000`. Install the
[`kubelogin`/`kubectl oidc-login` plugin](https://github.com/int128/kubelogin)
once on each workstation:

```sh
# macOS or Linux with Homebrew
brew install kubelogin

# Or, with Krew
kubectl krew install oidc-login
```

Keep the vaulted certificate kubeconfig untouched. Make a protected OIDC copy
and configure an exec credential user in that copy:

```sh
install -m 0600 ~/.kube/k8s-homelab.yaml ~/.kube/k8s-homelab-oidc.yaml
export KUBECONFIG="$HOME/.kube/k8s-homelab-oidc.yaml"

kubectl config set-credentials homelab-keycloak \
  --exec-interactive-mode=Never \
  --exec-api-version=client.authentication.k8s.io/v1 \
  --exec-command=kubectl \
  --exec-arg=oidc-login \
  --exec-arg=get-token \
  --exec-arg=--oidc-issuer-url=https://auth.lab.seandre.dev/realms/homelab \
  --exec-arg=--oidc-client-id=kubectl \
  --exec-arg=--token-cache-storage=keyring

kubectl config set-context "$(kubectl config current-context)" \
  --user=homelab-keycloak
kubectl auth whoami
kubectl get pods -A
```

The first command that needs the API opens the browser at the local callback.
Only members of `homelab-admins` receive the `keycloak:cluster-admin` group for
this client. Operators and viewers should receive `Forbidden` from kubectl;
use Headlamp for their read-only Kubernetes view instead.

To force a fresh kubectl login, clear the plugin cache and retry:

```sh
kubectl oidc-login clean
```

To return to certificate break-glass access, point `KUBECONFIG` back at the
original certificate kubeconfig rather than changing the OIDC copy.

### Argo CD CLI

The Argo CD CLI uses the separate public `argocd-cli` PKCE client and its
loopback callback at `http://localhost:8085/auth/callback`:

```sh
argocd login argocd.lab.seandre.dev --sso --grpc-web
argocd account get-user-info
argocd app list
argocd logout argocd.lab.seandre.dev
```

Use the vaulted native Argo CD administrator only for break-glass recovery or
for operations that the mapped Keycloak group does not allow.

### User and group administration

Normal identity administration happens in the Keycloak Admin Console under the
`homelab` realm. Create a user, send/verify the email, require or enroll a
passkey, and add the user to one of these groups:

| Group | Headlamp | kubectl | Grafana | Argo CD |
|---|---|---|---|---|
| `homelab-admins` | Read-only | `cluster-admin` | Admin | Full admin |
| `homelab-operators` | Read-only | No Kubernetes binding | Editor | Application get/sync/log |
| `homelab-viewers` | Read-only | No Kubernetes binding | Viewer | Read-only |

Do not edit client roles directly for routine onboarding. Group membership is
the intended source of access. A changed group takes effect on the next token
issuance; clear the kubectl token cache or sign out of browser applications
when testing a change.

KeycloakRealmImport is bootstrap-only. Once the `homelab` realm exists, make
realm, user, group, and MFA changes in Keycloak and record the administrative
change separately; editing the import YAML does not reconcile the existing
database.

## Rollout gates

Run these phases in order. Keep the existing certificate kubeconfig, the
Keycloak master bootstrap administrator, Grafana native administrator, and
Argo CD local administrator vaulted as break-glass paths.

### 1. Operators, storage, database, and backup

- Create private DNS and confirm that `auth.lab.seandre.dev` resolves to
  `192.168.40.30` only from LAN/VPN resolvers.
- Confirm cert-manager's DNS-01 credentials and issue
  `keycloak/keycloak-private-tls`.
- Create the runtime Secrets and run the validator.
- Sync `homelab-identity-operators`, then `homelab-keycloak`.
- Confirm the two identity nodes are labeled by Ansible and node 3 is not:

  ```sh
  kubectl get nodes -L homelab.seandre.dev/identity
  kubectl -n keycloak get cluster keycloak-postgres
  kubectl -n keycloak get pods -o wide
  kubectl -n keycloak get scheduledbackup,backup,objectstore
  ```

  The Ansible play labels only `k8s-control-01` and `k8s-worker-01` and
  removes the identity label from every other node in the k3s inventory.

- Confirm the two PostgreSQL PVCs use `local-path-retain`, are 5 GiB, and are
  on different hostnames. Confirm the first Barman base backup and WAL archive
  have completed before treating R2 as operational.
- Run an isolated R2 restore/PITR drill before moving to the clients. Use a
  disposable namespace and a separate recovery cluster; never test recovery by
  changing the production Keycloak cluster.
- Run the 03:30 PBS dump once manually. Confirm the encrypted snapshot is
  visible in PBS and restore it into an isolated PostgreSQL instance.

### 2. Realm and MFA

The import creates groups `homelab-admins`, `homelab-operators`, and
`homelab-viewers`, plus client roles `headlamp-readonly` and `cluster-admin`.
It does not put a human owner or a secret value in Git.

Using the vaulted bootstrap administrator, create the owner in the `homelab`
realm, verify the email address through the configured SMTP path, add the user
to `homelab-admins`, and enroll a platform passkey. WebAuthn registration is a
default required action for newly created users; copy the browser flow and make
password plus WebAuthn the normal path. Retain TOTP and one-time recovery
codes as controlled fallback credentials. Test passkey, TOTP, recovery code,
email password recovery, logout, and expired-session behavior before handing
the owner account to the normal login path.

Keep the bootstrap administrator exclusively in `master`. Rotate its password
after the first successful recovery test and store the new value only in the
password manager.

### 3. Kubernetes, Headlamp, and kubectl

`ansible/playbooks/install-k3s.yml` manages
`/etc/rancher/k3s/authentication-config.yaml` and the k3s
`--kube-apiserver-arg authentication-config=...` argument. The structured
authenticator maps:

| OIDC field | Kubernetes result |
|---|---|
| `preferred_username` | `keycloak:<name>` |
| `sub` | immutable user UID |
| `kubernetes_groups` | `keycloak:<client-role>` |

The issuer accepts audiences `headlamp` and `kubectl`. Certificate
authentication remains enabled as the recovery path. Apply Ansible only after
the issuer discovery endpoint and TLS certificate pass from the control-plane
host, then confirm the server returns ready again.

Headlamp uses the confidential `headlamp` client and receives only
`keycloak:headlamp-readonly`. Its Kubernetes ClusterRole can read workloads,
events, logs, and non-secret metadata; it has no Secret, exec, create, patch,
or delete permission. Its pod ServiceAccount remains unprivileged.

The public `kubectl` client uses PKCE at `http://localhost:8000`. Only members
of `homelab-admins` receive the `keycloak:cluster-admin` group for this client,
which is bound to the Kubernetes `cluster-admin` ClusterRole. Test one audited
mutation in a disposable namespace and remove the namespace afterward.

Do not remove or rotate the certificate kubeconfig until the OIDC outage test
has demonstrated that it still works when Keycloak is unavailable.

### 4. Grafana and Argo CD

Grafana uses Generic OAuth with PKCE, refresh tokens, ID-token validation, and
the three group mappings:

- `homelab-admins` → Grafana `Admin`
- `homelab-operators` → Grafana `Editor`
- `homelab-viewers` → Grafana `Viewer`

Automatic OAuth redirection remains disabled until the existing Grafana memory
instability is controlled and each role has passed an individual login test.
The native Grafana administrator remains vaulted.

Argo CD uses direct Keycloak OIDC with `argocd` for the web callback and
`argocd-cli` for the loopback callback. Its RBAC maps admins to `role:admin`,
operators to application get/sync/log access, and viewers to read-only. The
native Argo CD administrator remains vaulted. Leave Dex running during the
soak; scale its unused deployment to zero only after seven consecutive days of
successful Keycloak logins, break-glass checks, and reconciliation.

## Acceptance and rollback

The identity stack is accepted only when all of these are recorded:

- Keycloak and PostgreSQL replicas are split across `k8s-control-01` and
  `k8s-worker-01`; no identity pod can schedule on `k8s-worker-02`.
- Draining either identity node preserves sign-in and causes a clean CNPG
  primary changeover.
- Headlamp is read-only and cannot read Secrets or execute in a pod.
- kubectl OIDC performs one audited disposable-namespace mutation.
- Grafana and Argo CD roles match all three groups.
- MFA, recovery, logout, and expiry paths work.
- R2 PITR and encrypted PBS logical restore both succeed in isolation.
- Certificate kubeconfig and native local administrators still work during a
  Keycloak outage.

Rollback is service-by-service: set Headlamp, Grafana, Argo CD, or k3s back to
its previously vaulted/native configuration while leaving the Keycloak data
plane intact. If the structured authenticator causes an API problem, remove
the Ansible-managed authentication argument and restart the single k3s server;
certificate authentication remains the break-glass method. Do not delete the
realm or PostgreSQL PVCs as a rollback action.

## Deliberately deferred integrations

After the core seven-day soak, evaluate Proxmox VE and PBS native OpenID
realms. Use oauth2-proxy only for applications without native OIDC. Home
Assistant, Nexus Community, UniFi cloud access, KOReader Sync, and the public
cycling calendar remain outside this rollout until their client and webhook
behavior is separately tested.

References: [Keycloak Operator deployment](https://www.keycloak.org/operator/basic-deployment),
[Keycloak realm import](https://www.keycloak.org/operator/realm-import),
[CloudNativePG monitoring](https://cloudnative-pg.io/docs/1.29/monitoring/),
[Barman Cloud Plugin](https://cloudnative-pg.io/plugin-barman-cloud/docs/intro/),
[Kubernetes authentication configuration](https://kubernetes.io/docs/reference/access-authn-authz/authentication/),
[Argo CD OIDC](https://argo-cd.readthedocs.io/en/stable/operator-manual/user-management/),
and [Grafana Generic OAuth](https://grafana.com/docs/grafana/latest/setup-grafana/configure-access/configure-authentication/generic-oauth/).
The PBS client command contract is documented in the
[Proxmox Backup Client manual](https://pbs.proxmox.com/docs/proxmox-backup-client/man1.html).
