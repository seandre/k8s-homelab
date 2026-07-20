# Optional 04: VitePress Documentation Site

VitePress builds the Markdown under `docs/` into a static Vue-backed site. An unprivileged nginx container serves the generated HTML, CSS, JavaScript, and local-search index. Git remains the source of truth and the site needs no persistent storage.

The private endpoint is `https://docs.lab.seandre.dev`. UniFi resolves it to the Traefik ingress VIP `192.168.40.30`; Cloudflare remains authoritative publicly and is used only for ACME DNS-01 challenges.

## Architecture

- `docs/` contains the Markdown source.
- `docs-site/vitepress/` contains the VitePress configuration, sidebar, theme, Docs/Homepage product switcher, and pinned dependency tree.
- `docs-site/Dockerfile` builds the site and copies only the static output into the runtime image.
- `docs-site/nginx.conf` serves clean URLs such as `/build/public-domain-tls` and redirects the former `/optional/docusaurus-site` route.
- `.github/workflows/docs-image.yaml` builds and deploys each documentation commit.
- `kubernetes/apps/homelab-docs/` defines the namespace, Deployment, Service, and Ingress.
- Argo CD reconciles the app through `kubernetes/clusters/homelab/apps`.

VitePress provides the sidebar, responsive navigation, syntax highlighting, copy buttons, light and dark themes, edit links, per-page update times, and browser-local full-text search. The build fails on unresolved internal links.

## Build and Preview Locally

Install the pinned dependencies and build the production site:

```bash
cd ~/Developer/k8s-homelab/docs-site/vitepress
npm ci
npm run build
npm run preview -- --port 3000
```

Open `http://127.0.0.1:3000` and check navigation, search, code blocks, edit links, and light/dark mode. Stop the preview server with `Ctrl-C`.

For faster authoring with hot reload, run:

```bash
npm run dev -- --port 3000
```

Local search works in both development and production preview. Before committing, still run the production build because it performs the complete static render and dead-link validation.

The generated `docs-site/vitepress/dist/`, `docs-site/vitepress/.vitepress/cache/`, and `docs-site/vitepress/node_modules/` directories are ignored by Git. Node.js and all build dependencies stay in the build stage and are not copied into the nginx runtime image.

The pinned VitePress 1.6.4 tree currently reports two moderate advisories and one high advisory through its Vite/esbuild development toolchain, with no compatible fix published in that release line. They do not ship in the final nginx image. Bind the development server only to localhost, upgrade VitePress when a compatible patched release is available, and do not force an unsupported transitive Vite major version into the lockfile.

If Docker and its daemon are available, also test the exact production container:

```bash
docker build -f docs-site/Dockerfile -t homelab-docs:local .
docker run --rm -p 8080:8080 homelab-docs:local
```

Open `http://127.0.0.1:8080`. In addition to the home page, request a clean nested URL directly so nginx routing is covered:

```bash
curl -I http://127.0.0.1:8080/build/public-domain-tls
```

## Publishing: Commit Equals Deployment

Every documentation push to `main` automatically builds and deploys a new immutable image. The workflow runs when a commit changes any of these inputs:

- `docs/**`
- `docs-site/Dockerfile`
- `docs-site/nginx.conf`
- `docs-site/vitepress/**`
- `.dockerignore`
- `.github/workflows/docs-image.yaml`

The deployment sequence is:

1. GitHub Actions builds the VitePress production site inside the multi-stage container build.
2. The workflow pushes `ghcr.io/seandre/k8s-homelab-docs:main` and an immutable `sha-<commit>` tag to GHCR.
3. Only after the image push succeeds, the workflow replaces the image in `kubernetes/apps/homelab-docs/deployment.yaml` with that immutable tag.
4. The workflow commits and pushes the Deployment update to `main` as `github-actions[bot]`.
5. Argo CD detects the commit and rolls out the new static site.

The bot's Deployment-only commit does not match the documentation workflow paths, so it does not create a build loop. Concurrent runs cancel older builds, and a run exits without a commit when its image is already deployed. If newer documentation reaches `main` while an older build is finishing, the older workflow does not overwrite it.

The workflow needs repository **Read and write permissions** under **Settings → Actions → General → Workflow permissions**. Its `GITHUB_TOKEN` also needs package write access. Keep the GHCR package private unless the generated documentation is intentionally public; the namespace uses the `ghcr-pull` image pull Secret.

## Make a Documentation Change

```bash
cd ~/Developer/k8s-homelab

# Edit Markdown or the site configuration, then validate it.
cd docs-site/vitepress
npm ci
npm run build
cd ../..

git diff --check
git status --short
git add docs docs-site .github/workflows/docs-image.yaml
git diff --cached --check
git diff --cached
git commit -m "update homelab documentation"
git push origin main
```

Only stage paths actually changed by the edit. After pushing, open **Actions → Build homelab documentation image** and wait for the build, image push, and immutable-tag commit to complete.

## Verify the Rollout

Set the current k3s kubeconfig and confirm Argo CD and the workload converge:

```bash
export KUBECONFIG=~/.kube/k8s-homelab.yaml

kubectl -n argocd get application homelab-apps
kubectl -n homelab-docs rollout status \
  deployment/homelab-docs --timeout=180s
kubectl -n homelab-docs get pods,service,ingress
```

Test the endpoint without disabling certificate validation:

```bash
curl -I https://docs.lab.seandre.dev

openssl s_client \
  -connect docs.lab.seandre.dev:443 \
  -servername docs.lab.seandre.dev \
  -verify_return_error </dev/null
```

Open `https://docs.lab.seandre.dev` and verify:

- the edited content is visible;
- all four required build tutorials appear in order;
- search returns results from multiple documents;
- code-copy buttons work;
- light and dark themes are readable; and
- direct requests to nested clean URLs do not return 404 responses.

## Roll Back

Revert the workflow's `deploy docs image sha-*` commit or restore a previous immutable tag in `kubernetes/apps/homelab-docs/deployment.yaml`, then push the change. This manifest-only commit does not build another image; Argo CD deploys the restored image automatically.

## Troubleshooting

### The GitHub Actions workflow fails

- Run `npm ci` and `npm run build` from `docs-site/vitepress`.
- Check the build output for a broken Markdown link, invalid VitePress configuration, or missing Docker context file.
- Confirm Actions are enabled and workflow permissions allow repository and package writes.
- Confirm all new build inputs are included in both workflow path lists: the trigger list and the newer-change safety check.

### The pod reports `ImagePullBackOff`

```bash
kubectl -n homelab-docs get deployment homelab-docs \
  -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
kubectl -n homelab-docs describe pod -l app.kubernetes.io/name=homelab-docs
```

The common causes are a missing or expired `ghcr-pull` Secret, an incorrect immutable tag, or a failed image push.

### A clean URL returns 404

Build the production container and request the same path through port `8080`. Confirm `docs-site/nginx.conf` contains the `$uri.html` fallback and the Markdown file has a matching route. VitePress derives routes directly from paths under `docs/`.

### DNS works but Traefik returns 404

```bash
kubectl -n homelab-docs describe ingress homelab-docs
kubectl -n homelab-docs get service,endpoints
kubectl -n homelab-docs get pods -o wide
```

Confirm the requested hostname is `docs.lab.seandre.dev` and the Service has a ready endpoint on port `8080`.

### The certificate is not ready

```bash
kubectl -n homelab-docs describe certificate homelab-docs-public-tls
kubectl -n homelab-docs get certificaterequest,order,challenge
kubectl -n cert-manager logs deployment/cert-manager --tail=100
```

Check the Cloudflare token scope, issuer readiness, authoritative delegation, and public TXT propagation. DNS-01 does not require a public A/AAAA record or an inbound router port forward. The complete issuer procedure is in [Build 01: Public DNS and TLS](../build/public-domain-tls.md).
