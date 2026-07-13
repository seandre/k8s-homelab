# Build 01: Publicly Trusted TLS with `seandre.dev`

> Status: planned. Cloudflare delegation is verified, no private homelab A/AAAA records are publicly published, and the k3s DNS-01 proof has not yet been performed. Bastion, Nexus, and OKD certificate steps are future work.

This tutorial replaces browser and `curl` trust warnings for homelab web applications with certificates from Let's Encrypt. The applications remain reachable only from the trusted LAN or VPN; buying a public domain does not require publishing the ingress controller to the internet.

The design uses:

- `lab.seandre.dev` as the private homelab DNS zone;
- split-horizon DNS so homelab names resolve to `192.168.40.30` on LAN/VPN clients;
- cert-manager's ACME DNS-01 challenge to prove control of `seandre.dev`;
- publicly trusted certificates, so clients no longer need the `homelab-root-ca` installed; and
- no public A records, router port forwards, or public Traefik exposure.

This tutorial uses Cloudflare DNS because cert-manager supports its API directly. If the domain uses another authoritative DNS provider, keep the same architecture but use that provider's cert-manager DNS-01 webhook or solver. The registrar may remain separate from the authoritative DNS provider.

## Target Design

| Application | Current name | New name |
|---|---|---|
| Argo CD | `argocd.lab.home.arpa` | `argocd.lab.seandre.dev` |
| Grafana | `grafana.lab.home.arpa` | `grafana.lab.seandre.dev` |
| Homepage | `home.lab.home.arpa` | `home.lab.seandre.dev` |
| nginx test | `nginx-test.lab.home.arpa` | `nginx-test.lab.seandre.dev` |
| KOReader Sync | `kosync.lab.home.arpa` | `kosync.lab.seandre.dev` |
| Homelab docs | Not deployed | `docs.lab.seandre.dev` |

The existing `lab.home.arpa` records can remain during migration. Public CAs cannot issue certificates for `.home.arpa`, so clients must use the new names to receive publicly trusted TLS.

### Why `lab.seandre.dev` instead of `home.seandre.dev`?

Use `lab.seandre.dev` for services that belong to this technical environment: Kubernetes applications, hypervisors, monitoring, storage, and other infrastructure. It maps directly from the repo's existing `lab.home.arpa` convention and remains clear if `seandre.dev` later hosts a public website.

Reserve `home.seandre.dev` for something that represents the household or home itself, such as a family portal or Home Assistant. Do not use both `home` and `lab` interchangeably for the same environment. Consistency matters more than either label, but `lab` is the better fit for this repository.

In documentation, `*.lab.seandre.dev` can mean “all first-level service names under the lab zone.” The `*` is notation unless an actual wildcard DNS record or wildcard certificate is explicitly created. This tutorial uses individual certificates per ingress rather than one shared wildcard certificate. Individual certificates limit private-key reuse and compromise impact. They do expose each certificate hostname in public Certificate Transparency logs; use a wildcard certificate only if hiding individual internal service names from those logs is worth the larger shared-key blast radius. DNS-01 supports either choice.

## Step 1: Put Public DNS on Cloudflare

Add `seandre.dev` to Cloudflare and change the domain's authoritative nameservers at the registrar to the nameservers Cloudflare assigns. Wait until Cloudflare reports the zone as active.

Before changing private DNS, export or screenshot the current UniFi local records and DHCP reservations. Store the export with the infrastructure recovery material, not in Git if it contains private device identifiers.

Current verified state for this plan: Cloudflare is authoritative for `seandre.dev`; no homelab or OKD A/AAAA records are publicly published; and CAA is unset. Recheck rather than assuming that state is unchanged:

Confirm the delegation from a workstation:

```bash
dig NS seandre.dev +short
```

Do not create public A or AAAA records pointing at the homelab. DNS-01 validation uses short-lived public TXT records and does not need inbound access to ports 80 or 443.

If DNSSEC was enabled at the registrar before changing nameservers, update or remove the old DS record as part of the provider migration. A stale DS record can make the entire domain fail DNSSEC validation.

Also inspect any CAA records before issuance:

```bash
dig CAA seandre.dev +short
```

No CAA record permits any public CA. If CAA records exist, ensure they authorize `letsencrypt.org`; otherwise Let's Encrypt must refuse issuance.

Leave CAA unset for the first issuance proof. After successful renewal testing, an optional hardening step is to authorize only `letsencrypt.org`, including `issuewild` if wildcard certificates will be issued.

## Step 2: Create a Restricted Cloudflare API Token

In Cloudflare, create an API token with only these permissions:

- Zone / DNS / Edit
- Zone / Zone / Read

Restrict its zone resources to `seandre.dev`. Do not use the Global API Key.

Store the token in a password manager. Create the Kubernetes Secret directly from an interactive prompt so the token does not enter shell history or Git:

```bash
read -rs CLOUDFLARE_API_TOKEN
echo
printf %s "$CLOUDFLARE_API_TOKEN" | \
  kubectl -n cert-manager create secret generic cloudflare-api-token \
    --from-file=api-token=/dev/stdin
unset CLOUDFLARE_API_TOKEN
```

Confirm only the Secret metadata and key name:

```bash
kubectl -n cert-manager get secret cloudflare-api-token \
  -o go-template='{{range $k, $v := .data}}{{$k}}{{"\n"}}{{end}}'
```

Expected output is `api-token`. Never commit the plaintext Secret. Record its recovery procedure in the password manager; losing the cluster does not invalidate the token, but a rebuilt cluster needs the Secret recreated before certificate renewal.

## Step 3: Add Staging and Production ACME Issuers

Create `kubernetes/infrastructure/cert-manager/letsencrypt-issuers.yaml` with the following content. Replace the email address with an address you control. Let's Encrypt stopped certificate-expiration notification emails in June 2025, so this address is not a substitute for renewal monitoring.

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: YOUR_EMAIL_ADDRESS
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - selector:
          dnsZones:
            - seandre.dev
        dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-production
spec:
  acme:
    email: YOUR_EMAIL_ADDRESS
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-production-account-key
    solvers:
      - selector:
          dnsZones:
            - seandre.dev
        dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
```

Add the file to `kubernetes/infrastructure/cert-manager/kustomization.yaml`:

```yaml
resources:
  - https://github.com/cert-manager/cert-manager/releases/download/v1.20.3/cert-manager.yaml
  - issuers.yaml
  - letsencrypt-issuers.yaml
```

Render before committing:

```bash
kubectl kustomize kubernetes/infrastructure/cert-manager >/dev/null
kubectl kustomize kubernetes/clusters/homelab/infrastructure >/dev/null
```

Commit and push the change, wait for Argo CD to reconcile, and verify both issuers:

```bash
kubectl get clusterissuer letsencrypt-staging letsencrypt-production
kubectl describe clusterissuer letsencrypt-staging
```

Both issuers should eventually report `Ready=True`.

## Step 4: Prove DNS-01 with a Disposable Staging Certificate

Do not replace KOReader Sync's live certificate for the staging test. Create a standalone, disposable `Certificate` in an existing namespace:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: dns01-staging-test
  namespace: cert-manager
spec:
  secretName: dns01-staging-test-tls
  issuerRef:
    kind: ClusterIssuer
    name: letsencrypt-staging
  dnsNames:
    - acme-test.lab.seandre.dev
```

Apply it directly for this one-time operational test, then inspect issuance:

```bash
kubectl apply -f /tmp/dns01-staging-test.yaml
kubectl -n cert-manager get certificate,certificaterequest,order,challenge
kubectl -n cert-manager describe certificate dns01-staging-test
kubectl -n cert-manager logs deployment/cert-manager --tail=100
```

The staging `Certificate` should become ready. A staging certificate is deliberately not trusted by clients; this step tests DNS credentials and issuance without risking Let's Encrypt production rate limits.

Delete the test after recording the result. This does not touch any live Ingress or Secret:

```bash
kubectl -n cert-manager delete certificate dns01-staging-test
kubectl -n cert-manager delete secret dns01-staging-test-tls --ignore-not-found
```

If the challenge stalls, check the token permissions, the `seandre.dev` zone restriction, authoritative nameserver delegation, and any stale DNSSEC DS record. Do not work around DNS-01 by forwarding ports from the internet.

## Step 5: Prove Production with KOReader Sync

Change only the issuer annotation:

```yaml
cert-manager.io/cluster-issuer: letsencrypt-production
```

Use a new Secret name in the Ingress so the existing private-CA certificate remains available during rollback:

```yaml
secretName: kosync-public-tls
```

Commit and push. Wait for the new certificate:

```bash
kubectl -n kosync get certificate,certificaterequest,order,challenge
kubectl -n kosync wait --for=condition=Ready \
  certificate/kosync-public-tls --timeout=5m
```

The Certificate resource name generated by ingress-shim normally matches the TLS Secret name. Confirm with `kubectl -n kosync get certificate` before using the wait command if it differs.

## Step 6: Add Private UniFi DNS Records

Create these local DNS records in UniFi, all pointing to the existing MetalLB ingress VIP `192.168.40.30`:

| Name | Address |
|---|---|
| `argocd.lab.seandre.dev` | `192.168.40.30` |
| `grafana.lab.seandre.dev` | `192.168.40.30` |
| `home.lab.seandre.dev` | `192.168.40.30` |
| `nginx-test.lab.seandre.dev` | `192.168.40.30` |
| `kosync.lab.seandre.dev` | `192.168.40.30` |
| `docs.lab.seandre.dev` | `192.168.40.30` |

Do not add equivalent public A/AAAA records. Confirm from both a LAN client and a VPN client:

```bash
dig +short kosync.lab.seandre.dev
```

Expected output is `192.168.40.30`. From an ordinary external resolver, the name should have no A or AAAA answer. If VPN clients use public DNS instead of UniFi DNS, configure the VPN to use the homelab resolver or add an equivalent conditional/private zone there.

## Step 7: Verify Trusted TLS End to End

Test without `-k` and without installing a private CA:

```bash
curl -v https://kosync.lab.seandre.dev/healthcheck
openssl s_client \
  -connect kosync.lab.seandre.dev:443 \
  -servername kosync.lab.seandre.dev \
  -verify_return_error </dev/null
```

Verify that:

- DNS resolves to `192.168.40.30` on the trusted network;
- the certificate subject alternative name includes `kosync.lab.seandre.dev`;
- the issuer is Let's Encrypt rather than `homelab-root-ca`; and
- `Verify return code: 0 (ok)` appears.

The `.dev` top-level domain is HSTS-preloaded, so browsers require valid HTTPS. Complete production certificate issuance before switching bookmarks and application clients to the new names. Test with `curl` and `openssl` first so browser behavior does not obscure a DNS or certificate problem.

## Step 8: Migrate the Remaining Ingresses

Update each ingress to use its new hostname and `letsencrypt-production`:

- `kubernetes/infrastructure/ingress/argocd/ingress.yaml`
- `kubernetes/apps/homepage/ingress.yaml`
- `kubernetes/apps/nginx-test/ingress.yaml`
- `kubernetes/apps/homelab-docs/ingress.yaml`
- `kubernetes/clusters/homelab/monitoring.yaml`

Use new TLS Secret names such as `argocd-public-tls`, `homepage-public-tls`, `nginx-test-public-tls`, `grafana-public-tls`, and `homelab-docs-public-tls`. Changing the Secret names prevents old private-CA certificates from being mistaken for the new certificates during migration.

Render both layers before committing:

```bash
kubectl kustomize kubernetes/clusters/homelab/infrastructure >/dev/null
kubectl kustomize kubernetes/clusters/homelab/apps >/dev/null
```

The monitoring application is a Helm-backed Argo CD `Application`, so also inspect its rendered/synchronized state through Argo CD after changing its inline values.

After reconciliation:

```bash
kubectl get certificate -A
curl -I https://argocd.lab.seandre.dev
curl -I https://grafana.lab.seandre.dev
curl -I https://home.lab.seandre.dev
curl -I https://nginx-test.lab.seandre.dev
curl -I https://kosync.lab.seandre.dev/healthcheck
curl -I https://docs.lab.seandre.dev
```

An HTTP redirect or application-specific status is acceptable; a certificate validation error is not.

Update application configuration, bookmarks, Homepage links, KOReader's custom sync server, documentation, and monitoring targets to use the new names. Argo CD may require its configured external URL to be updated if OAuth, webhooks, or CLI callbacks depend on it.

## Step 9: Retire the Old Names Safely

Keep the old `lab.home.arpa` DNS records and `homelab-ca` issuer during a short migration window. Once all clients use the new names:

1. Remove obsolete `lab.home.arpa` application records from UniFi.
2. Remove the old ingress hostnames if any were temporarily retained as additional rules.
3. Confirm every public certificate renews through `letsencrypt-production`.
4. Remove `homelab-root-ca` from clients only if nothing else still uses it.
5. Retain the private CA manifests until all non-HTTP internal certificate use has been audited.

Do not delete `homelab-root-ca` merely because ingress migrated. Proxmox, SSH, raw IP addresses, and other services are separate trust and naming problems; this tutorial changes only Kubernetes HTTPS ingress certificates.

## Renewal and Recovery Checks

cert-manager renews ACME certificates automatically. Check them periodically:

```bash
kubectl get certificate -A
kubectl get clusterissuer letsencrypt-production
kubectl -n cert-manager logs deployment/cert-manager --since=24h
```

Do not rely on manual checks alone. Add an alert for certificates approaching expiry (for example, using cert-manager's Prometheus expiration metrics) before treating the migration as complete. Public trust removes private-root installation; it does not eliminate renewal failures caused by an expired/revoked DNS token, broken delegation, DNSSEC errors, or cert-manager downtime.

For disaster recovery, preserve these facts outside the cluster:

- Cloudflare remains authoritative for `seandre.dev`;
- the restricted API token is stored in the password manager;
- `cloudflare-api-token` must be recreated in `cert-manager` before issuance;
- the ACME issuer manifests and ingress names remain in Git; and
- UniFi private DNS records must be restored for LAN/VPN resolution.

The ACME account private-key Secrets are useful but replaceable. The DNS API token and control of the domain are what allow a rebuilt cluster to obtain fresh certificates.

## Bastion and Nexus TLS (Planned)

Build `bastion-01` only after `pve-02`. Nexus resolves privately as `nexus.lab.seandre.dev` at `192.168.40.33`; do not publish a public A/AAAA record. Terminate Nexus HTTPS on `.33:443`, separate from HAProxy's OKD ingress listener on `.31:443`.

Issue the Nexus certificate with DNS-01 from a controlled ACME client or cert-manager workflow and deploy its full chain and private key with restrictive permissions. Automate renewal and service reload, monitor expiry, and test restoration. A wildcard certificate is not required for this single endpoint.

## OKD Platform Certificates (Planned)

Do this only after the connected compact cluster is installed and every ClusterOperator is stable. Install a supported cert-manager release on OKD and recreate the restricted Cloudflare token Secret outside Git.

Issue two deliberately separate certificates:

| Certificate | Namespace | Platform use |
|---|---|---|
| `*.apps.okd.lab.seandre.dev` | `openshift-ingress` | default IngressController certificate |
| `api.okd.lab.seandre.dev` | `openshift-config` | API server named certificate |

The applications certificate must be a real wildcard certificate because arbitrary Routes live below `apps.okd.lab.seandre.dev`. DNS-01 is required. Verify a random route hostname and the console without a private CA after the IngressController rolls out.

Configure only the public API name as the API server named certificate. **Never add a custom certificate for `api-int.okd.lab.seandre.dev`.** OKD manages that internal endpoint, and current guidance warns that replacing its certificate can degrade the cluster. Follow the [OKD API certificate procedure](https://docs.okd.io/latest/security/certificates/api-server.html) for the installed release.

Verify from a trusted client:

```bash
curl --fail --show-error https://api.okd.lab.seandre.dev:6443/version
openssl s_client -connect api.okd.lab.seandre.dev:6443 \
  -servername api.okd.lab.seandre.dev -verify_return_error </dev/null
openssl s_client -connect console-openshift-console.apps.okd.lab.seandre.dev:443 \
  -servername console-openshift-console.apps.okd.lab.seandre.dev \
  -verify_return_error </dev/null
```

## DNS Troubleshooting Across the Split Horizon

- Query the authoritative Cloudflare nameservers directly for ACME TXT state; query UniFi or `192.168.40.33` for private A, CNAME, wildcard, and PTR state.
- Public resolvers must return no A/AAAA answer for k3s, Nexus, or OKD private names.
- `dnsmasq` must forward unmatched TXT requests. Do not create a local authoritative copy of all `seandre.dev` that hides Cloudflare's `_acme-challenge` answers.
- If UniFi conditional forwarding is unavailable, distribute `192.168.40.33` as DNS to trusted LAN/VPN clients and configure OKD nodes to use it directly.
- Check CNAME delegation, negative caching, DNSSEC DS records, Cloudflare token scope, and cert-manager Challenge events before changing firewall exposure.
- Because `.dev` is HSTS-preloaded, plain HTTP is not a browser fallback or certificate diagnostic. Use `dig`, `curl`, and `openssl` to isolate DNS, routing, and TLS issuance failures.

## Security Boundaries

- Do not forward TCP 80 or 443 to Traefik for this design.
- Do not publish private RFC 1918 addresses as public DNS records.
- Do not commit DNS API tokens or Kubernetes Secret data.
- Restrict the API token to DNS changes for only `seandre.dev`.
- Keep UniFi firewall rules limiting access to trusted LAN/VPN networks.
- Publicly trusted TLS authenticates the hostname and encrypts traffic; it does not make an exposed admin application safe by itself.

## Primary References

- [cert-manager ACME configuration](https://cert-manager.io/docs/configuration/acme/)
- [cert-manager DNS-01 configuration](https://cert-manager.io/docs/configuration/acme/dns01/)
- [cert-manager Cloudflare DNS-01 configuration](https://cert-manager.io/docs/configuration/acme/dns01/cloudflare/)
- [Let's Encrypt challenge types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt expiration email retirement](https://letsencrypt.org/2025/01/22/ending-expiration-emails/)
