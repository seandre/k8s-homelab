# Women’s Road Calendar — Operations Runbook

This runbook covers local review, dataset maintenance, final verification, and
GitOps operation of `cycling.seandre.dev`. All three review checkpoints in
the [build and architecture document](../build/womens-road-calendar.md) were
approved on 27 July 2026.

## Local hot-reload preview

Install dependencies once:

```bash
cd cycling-calendar
npm install
```

Start the normal computer-local preview:

```bash
npm run dev
```

Open `http://127.0.0.1:5174`. Vite applies saved changes without a production
build.

For a short phone or tablet review on the trusted LAN only:

```bash
npm run dev:lan
```

The LAN preview binds to port `5174` on all local interfaces and has no
authentication. Confirm that the workstation firewall and upstream network do
not publish the port. Stop the process with `Ctrl-C` immediately after the
review.

## Edit and validate the dataset

The maintained file is
`cycling-calendar/src/data/races-2026.json`.

For each maintenance pass:

1. check the UCI calendar or competition page first;
2. check the organizer or national federation page;
3. cross-check the event in ProCyclingStats;
4. retain unavailable or moved events with the correct status and a concise
   `dateNote`;
5. update the dataset-wide `reviewedOn` date;
6. add or update the source list when the review authority changes;
7. run the validator and tests.

```bash
cd cycling-calendar
npm run validate:data
npm run typecheck
npm run lint
npm test
```

The comparison helper accepts the public ProCyclingiCal HTML on standard input:

```bash
curl --fail --location https://www.procyclingical.com/ \
  | node scripts/extract-procyclingical.mjs --dataset
```

Review the output as a diff source. Do not redirect it over the maintained
dataset: it cannot by itself establish cancellations, postponements, organizer
links, or the authority of a schedule change.

## Review URL behavior

Search and filter state appears in query parameters. Sorting uses `sort` and
`dir`; the expanded race ID appears after `#`. A shared URL should restore the
same visible set and expanded event.

Verify:

- a combined search and filter survives reload;
- browser back and forward restore URL state;
- clearing filters removes non-default filter parameters;
- only one row is expanded;
- a hash pointing to a filtered-out race is removed;
- Organizer, PCS, and UCI links open in a new tab.

## Final production preview

Run this section only after Checkpoint 3 approval.

```bash
cd cycling-calendar
npm run validate:data
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4174` and confirm the exact production output rather than
the hot-reload development server. Do not edit files between the approved
revision, final build, container build, and image publication.

## CI and image publication

After an approved change reaches `main`, CI must:

1. validate data, type-check, lint, test, and build;
2. build the unprivileged Nginx image;
3. scan the image and fail on the repository’s approved vulnerability policy;
4. publish to `ghcr.io/seandre/womens-road-calendar`;
5. resolve the immutable image digest;
6. update the deployment pin without overwriting a newer concurrent revision;
7. allow Argo CD to reconcile the committed Git state.

Tags are discovery metadata only. Kubernetes runs an immutable
`image@sha256:…` reference. The workflow checks for a newer calendar change
before rebasing and pushing its deployment pin, so an older run cannot
overwrite newer application work.

## DNS and TLS

The active private split-DNS record is:

| Record | Value |
|---|---|
| `cycling.seandre.dev` | CNAME to `ingress.lab.seandre.dev` |

Do not add a public Cloudflare A, AAAA, CNAME, or proxied application record.
Cloudflare may answer only the DNS-01 ACME challenge used by cert-manager.

Verify from LAN and VPN:

```bash
dig A cycling.seandre.dev +short
curl --fail --head https://cycling.seandre.dev/
openssl s_client \
  -connect cycling.seandre.dev:443 \
  -servername cycling.seandre.dev </dev/null
```

The private resolver should lead to Traefik’s `192.168.40.30` ingress VIP, and
the certificate must be ready and publicly trusted.

## GitOps deployment checks

Before enabling the Deployment, confirm the namespace-local pull secret:

```bash
kubectl apply -f kubernetes/apps/cycling-calendar/namespace.yaml
kubectl -n cycling-calendar get secret ghcr-pull -o name
```

If the secret is absent, provision it through the homelab’s approved secret
workflow. Do not copy credentials into Git or clone another namespace’s Secret
manifest. Keep `../../../apps/cycling-calendar` out of
`kubernetes/clusters/homelab/apps/kustomization.yaml` until the check succeeds
and CI has replaced `bootstrap-not-published` with an immutable digest.

Enable Argo CD reconciliation by adding:

```yaml
resources:
  - ../../../apps/cycling-calendar
```

to `kubernetes/clusters/homelab/apps/kustomization.yaml`, then merge the
reviewed change.

Render and inspect the application:

```bash
kubectl kustomize kubernetes/apps/cycling-calendar
kubectl -n cycling-calendar get deployment,pod,service,ingress,networkpolicy
kubectl -n cycling-calendar rollout status deployment/cycling-calendar
```

The expected runtime contract is:

- one static application container;
- non-root, read-only filesystem, dropped Linux capabilities;
- Nginx port `8080`;
- readiness and liveness checks on the static endpoint;
- resource requests and limits;
- ingress only from Traefik;
- no application egress.

## Smoke checks

```bash
curl --fail --silent --show-error \
  https://cycling.seandre.dev/ >/dev/null
curl --fail --silent --show-error \
  https://cycling.seandre.dev/ | rg 'noindex'
curl --fail --head \
  https://cycling.seandre.dev/
```

Confirm the response includes the approved static security headers. Open the
page from both a LAN browser and the VPN, then verify search, filters, sorting,
expansion, reloadable URL state, and the mobile layout.

From a public resolver and a network outside the LAN/VPN, confirm the hostname
has no usable public application route.

## Troubleshooting

### Development port is already in use

The scripts use strict ports. Find and stop only the stale calendar process;
do not change the documented port because bookmarks and review notes rely on
it.

### Dataset validation fails

Read the reported race path and field. Common causes are duplicate IDs,
partially null dates, reversed dates, a Class 2 race marked one-day, an
incorrect championship level, or a changed event without `dateNote`.

### Ingress returns 404

Confirm the Ingress host exactly matches `cycling.seandre.dev`, the
IngressClass is Traefik, and the Service has ready endpoints on port `8080`.

### TLS is not ready

Inspect the Certificate, CertificateRequest, Challenge, and cert-manager logs.
Do not work around certificate errors with `curl -k`.

### Image pull fails

Confirm `ghcr-pull` exists in `cycling-calendar`, the Deployment references
that secret, and the private package credentials remain valid. Do not copy a
pull secret from another namespace in plain text.

### Page loads but data is stale

Inspect the image digest and the `reviewedOn` value in the approved source
revision. There is no runtime API; restarting a pod cannot obtain newer race
data.

## Rollback

Revert the Git commit that changed the immutable image digest, merge the
revert, and allow Argo CD to reconcile. Verify the rollout, hostname, TLS,
headers, and calendar behavior again.

If the new DNS record itself caused the incident, remove only
`cycling.seandre.dev`; do not alter the shared
`ingress.lab.seandre.dev` record.
