# Optional 04: Docusaurus Documentation Site

Docusaurus builds the Markdown under `docs/` into a static React-backed site. nginx serves the generated files from an unprivileged container; Git remains the source of truth and the site needs no persistent storage.

The final private endpoint is `https://docs.lab.seandre.dev`. UniFi resolves it to the existing Traefik ingress VIP `192.168.40.30`; Cloudflare remains authoritative publicly and is used only for ACME DNS-01 challenges.

The Kubernetes app is deliberately not selected by Argo CD yet. Complete the following steps in order so a missing image, DNS record, or certificate issuer does not degrade the active applications layer.

## 1. Build and Preview Docusaurus Locally

Install the pinned Node dependencies, build the production-static site, and serve that output:

```bash
cd ~/Developer/k8s-homelab/docs-site/docusaurus
npm ci
npm run build
npm run serve -- --port 3000
```

Open `http://127.0.0.1:3000` and check navigation, search, code blocks, and light/dark mode. Stop the server with `Ctrl-C`.

The local-search index is generated only by `npm run build`. The faster `npm run start` development server is useful while editing layout and content, but its search box does not have the production index. Always use `npm run build` followed by `npm run serve` when validating search.

The generated `docs-site/docusaurus/build/`, `.docusaurus/`, and `node_modules/` directories are ignored by Git.

The pinned dependency tree currently reports moderate advisories in transitive build and development-server packages. The high-severity `serialize-javascript` advisory is overridden to patched version `7.0.5`. Node.js and these build dependencies are not copied into the final nginx image. Do not run `npm audit fix --force`; npm currently proposes incompatible dependency downgrades. Upgrade Docusaurus and its build tools deliberately, then rerun `npm audit` and `npm run build`.

If Docker and its daemon are available, also test the production container locally:

```bash
docker build -f docs-site/Dockerfile -t homelab-docs:local .
docker run --rm -p 8080:8080 homelab-docs:local
```

Open `http://127.0.0.1:8080`, then stop the container with `Ctrl-C`.

## 2. Review and Commit the Scaffold

The earlier documentation reorganization may appear as deleted old paths and added numbered paths until Git stages the moves. Review everything before committing:

```bash
git status --short
git diff --check
git add -A
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Commit and push when the staged content is correct:

```bash
git commit -m "add Docusaurus documentation site"
git push origin main
```

## 3. Confirm the Image Workflow

The push should trigger `.github/workflows/docs-image.yaml`.

In GitHub:

1. Open the `k8s-homelab` repository.
2. Select **Actions**.
3. Open **Build homelab documentation image**.
4. Wait for the build-and-push job to finish successfully.
5. Record the immutable image tag shown by the metadata/build steps.

The workflow publishes both a moving `main` tag and an immutable tag resembling:

```text
ghcr.io/seandre/k8s-homelab-docs:sha-abcdef0
```

Do not enable the Kubernetes app until at least one image can be pulled successfully.

## 4. Choose GHCR Visibility

Choose visibility deliberately. Making the image public also makes the generated documentation inside it publicly downloadable, even though `docs.lab.seandre.dev` itself remains private.

If the repository and documentation are intended to be public:

1. Open the GitHub profile that owns the package.
2. Select **Packages**.
3. Open `k8s-homelab-docs`.
4. Select **Package settings**.
5. Under **Danger Zone**, select **Change visibility**, then **Public**.

GitHub states that public Container Registry packages allow anonymous pulls and that changing a package to public cannot be reversed. See [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility).

If the repository or documentation is private, keep the package private. Create a namespace-scoped GHCR pull Secret from a token with only `read:packages`, add an `imagePullSecrets` reference to the pod specification, and keep the token out of Git. Complete the repository's secrets-management workflow before depending on that Secret for recovery.

## 5. Pin the Immutable Image

Edit `kubernetes/apps/homelab-docs/deployment.yaml`. Replace:

```yaml
image: ghcr.io/seandre/k8s-homelab-docs:main
```

with the exact immutable tag produced by the successful workflow:

```yaml
image: ghcr.io/seandre/k8s-homelab-docs:sha-abcdef0
```

Render and commit the pinned deployment:

```bash
kubectl kustomize kubernetes/apps/homelab-docs >/dev/null
git add kubernetes/apps/homelab-docs/deployment.yaml
git commit -m "pin homelab docs image"
git push origin main
```

The image workflow does not need to run again for this manifest-only commit.

## 6. Finish the Cloudflare Issuer

Complete [Build 01: Public DNS and TLS](../10-build/01-public-domain-tls.md) through successful production DNS-01 issuance.

Confirm the production issuer exists and is ready:

```bash
KUBECONFIG=~/.kube/k8s-homelab.yaml \
  kubectl get clusterissuer letsencrypt-production
```

Expected state:

```text
NAME                     READY
letsencrypt-production   True
```

Do not enable the documentation app while the issuer is absent or reports `Ready=False`.

## 7. Add Private DNS

In UniFi, create this private DNS record:

```text
docs.lab.seandre.dev → 192.168.40.30
```

Verify from a trusted LAN or VPN client:

```bash
dig @192.168.40.1 docs.lab.seandre.dev +short
```

Expected output:

```text
192.168.40.30
```

Confirm public resolvers do not publish the private address:

```bash
dig @1.1.1.1 A docs.lab.seandre.dev +short
dig @1.1.1.1 AAAA docs.lab.seandre.dev +short
```

Both public queries should return no address. DNS-01 does not require a public A/AAAA record or an inbound router port forward.

## 8. Enable the App in GitOps

Edit `kubernetes/clusters/homelab/apps/kustomization.yaml` and add the documentation app while preserving the existing resources:

```yaml
resources:
  - ../../../apps/nginx-test
  - ../../../apps/homepage
  - ../../../apps/kosync
  - ../../../apps/homelab-docs
```

Render both the reusable app and the cluster selection layer:

```bash
kubectl kustomize kubernetes/apps/homelab-docs >/dev/null
kubectl kustomize kubernetes/clusters/homelab/apps >/dev/null
```

Commit and push the selection change:

```bash
git add kubernetes/clusters/homelab/apps/kustomization.yaml
git commit -m "deploy homelab documentation site"
git push origin main
```

Argo CD should reconcile the app automatically. Do not manually apply these manifests during normal deployment.

## 9. Watch the Rollout

Set the current k3s kubeconfig and watch the workload:

```bash
export KUBECONFIG=~/.kube/k8s-homelab.yaml

kubectl -n homelab-docs get pods,service,ingress
kubectl -n homelab-docs rollout status \
  deployment/homelab-docs --timeout=180s
```

Watch cert-manager create the public certificate:

```bash
kubectl -n homelab-docs get \
  certificate,certificaterequest,order,challenge

kubectl -n homelab-docs wait \
  --for=condition=Ready \
  certificate/homelab-docs-public-tls \
  --timeout=5m
```

Also confirm the parent Argo CD application remains healthy:

```bash
kubectl -n argocd get application homelab-apps
```

## 10. Verify the Live Site

Test the endpoint without `curl -k`:

```bash
curl -I https://docs.lab.seandre.dev
```

Verify the certificate chain and hostname:

```bash
openssl s_client \
  -connect docs.lab.seandre.dev:443 \
  -servername docs.lab.seandre.dev \
  -verify_return_error </dev/null
```

Expected TLS result:

```text
Verify return code: 0 (ok)
```

Open `https://docs.lab.seandre.dev` and verify:

- the home page loads;
- all four required build tutorials appear in order;
- search returns results from multiple documents;
- code-copy buttons work;
- light and dark themes are readable; and
- navigation links do not return 404 responses.

## Troubleshooting

### The GitHub Actions workflow fails

- Confirm Actions are enabled for the repository.
- Confirm the job has `contents: read` and `packages: write` permissions.
- Inspect the build step for a broken Markdown/MDX link, sidebar ID, dependency, or missing Docker context file.
- Run `npm ci` and `npm run build` from `docs-site/docusaurus` before pushing another change.

### The pod reports `ImagePullBackOff`

Check the image reference and pod events:

```bash
kubectl -n homelab-docs get deployment homelab-docs \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n homelab-docs describe pod -l app.kubernetes.io/name=homelab-docs
```

The common causes are a private GHCR package without an `imagePullSecret`, an incorrect tag, or a failed image workflow.

### The certificate remains pending

```bash
kubectl -n homelab-docs describe certificate homelab-docs-public-tls
kubectl -n homelab-docs get certificaterequest,order,challenge
kubectl -n cert-manager logs deployment/cert-manager --tail=100
```

Check the Cloudflare token scope, issuer readiness, authoritative delegation, and public TXT propagation. Do not solve a DNS-01 failure by opening inbound ports.

### DNS works but Traefik returns 404

```bash
kubectl -n homelab-docs describe ingress homelab-docs
kubectl -n homelab-docs get service,endpoints
kubectl -n homelab-docs get pods -o wide
```

Confirm the requested hostname exactly matches `docs.lab.seandre.dev` and the Service has a ready endpoint on port `8080`.

## Publishing Later Documentation Updates

Each documentation push builds a new immutable `sha-*` image. For a controlled update:

1. edit the Markdown and validate it with `npm run build` from `docs-site/docusaurus`;
2. commit and push the documentation;
3. wait for the image workflow;
4. copy the new immutable `sha-*` tag into the Deployment;
5. render the Kustomize layers; and
6. commit and push the image-tag update.

Argo CD will roll out the new static site and keep the previous Git commit and image tag available for rollback.
