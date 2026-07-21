# IE-003 Production Home Assistant Image Evidence

Date: 2026-07-21

Result: **LOCAL BUILD AND IMAGE VERIFICATION PASS; supply-chain CI pending merge
to `main`**. The production
definition uses the official Home Assistant `2026.7.2` base at
`sha256:1476924357b46e80735c13e94232ba5c853cac052e9df4bb28d50fa56348097b`.
It bakes the unchanged IE-002 Coway component and its hash-pinned
`cowayaio==0.2.4` source distribution without HACS.

## Prerequisite and immutable inputs

IE-002 is accepted. Its verifier fixes Coway IoCare `0.6.1` at upstream commit
`e0f29953f650b09c8d994aafba5c27634e0bb705` and archive SHA-256
`0a36be24d7294319880d1aa0cc6b6fcd9a66b8f2d08192bfd04b92c42204aaf5`.
IE-003 reuses that lock and verifier; it neither duplicates nor vendors the
upstream archive.

The component manifest requires `cowayaio==0.2.4`. The production install uses
pip hash-checking mode, disables dependency resolution, and accepts only the
PyPI source-distribution SHA-256
`05d49002fc9005159ff865f2429a13339d61975636c4c66077d90e2ee29891c8`.
The pinned HA base already supplies its runtime dependencies.

## Image behavior and CI evidence contract

The verified component is stored inside the image under
`/usr/local/share/homelab-home-assistant/custom_components/coway`. Because
IE-004 will mount writable state at `/config`, an s6 init hook stages and then
replaces `/config/custom_components/coway` from the immutable copy on every
start. A stale-file test proves upgrades cannot retain removed component files.

The Home Assistant image workflow performs, in dependency order:

1. HTTPS-only upstream download with retries, followed by the IE-002 checksum,
   archive-path, version, manifest, and dependency-pin verifier.
2. Positive and negative verifier tests plus a byte-for-byte directory diff
   between the independently extracted source and generated build context.
3. ShellCheck and Python syntax validation.
4. A production image build from the literal tag-and-digest base.
5. Home Assistant `check_config` and all four IE-002 import, config-flow,
   redaction, Airmega 250S entity, and Auto Eco tests inside that exact image.
6. Trivy HIGH/CRITICAL scanning with unfixed findings reported but ignored for
   the blocking decision, matching the existing repository image convention.
7. On `main` only, publication to
   `ghcr.io/<owner>/k8s-homelab-home-assistant:sha-<full-commit-sha>` with
   BuildKit SBOM and maximum-mode provenance attestations.

The workflow publishes no `latest`, calendar-version, branch, or short-SHA tag.
Publishing is intentionally absent from pull requests and local verification.

The local production build completed successfully as image
`homelab/home-assistant:ie003-verify`, local manifest-list digest
`sha256:0cdcfd9e64ed58634902af570f954b2d473efce67605a595f7c3a88ddabaea61`.
Image inspection confirmed entrypoint `/init`, the expected base-digest label,
and Coway commit label. This local digest is build evidence, not a deployment
reference or substitute for the GHCR digest produced by CI.

## Changed files

- `.github/workflows/home-assistant-image.yaml`
- `home-assistant/image/Dockerfile`
- `home-assistant/image/image.lock`
- `home-assistant/image/requirements.lock`
- `home-assistant/image/fetch-source.sh`
- `home-assistant/image/prepare-context.sh`
- `home-assistant/image/install-coway.sh`
- `home-assistant/image/verify-image.sh`
- `home-assistant/image/test-context.sh`
- `home-assistant/image/configuration.yaml`
- `home-assistant/image/README.md`
- `docs/operations/indoor-dashboard-ie-003-evidence.md`

## Verification performed

```sh
sh -n home-assistant/image/*.sh
home-assistant/image/test-context.sh /tmp/home-assistant-iocare-0.6.1.tar.gz
home-assistant/image/prepare-context.sh /tmp/home-assistant-iocare-0.6.1.tar.gz \
  /tmp/ie003.JPTayz/context
docker build --tag homelab/home-assistant:ie003-verify \
  /tmp/ie003.JPTayz/context
docker run --rm --entrypoint /usr/local/bin/verify-home-assistant-image \
  homelab/home-assistant:ie003-verify
ruby -e 'require "yaml"; YAML.load_file(ARGV.fetch(0))' \
  .github/workflows/home-assistant-image.yaml
git diff --check -- .github/workflows/home-assistant-image.yaml \
  home-assistant/image docs/operations/indoor-dashboard-ie-003-evidence.md
```

The fixed-pin, pristine-source, generated-context, direct startup-copy, YAML
parse, and whitespace checks pass locally. The production image build resolved
the expected base digest and accepted the hash-pinned Coway dependency. Inside
that exact image, Home Assistant `check_config` passed and all four Coway tests
passed: imports, config-flow/redaction, Airmega 250S entities, and report-only
Auto Eco behavior.

The real image entrypoint was also started with an empty temporary `/config`
mount. Its s6 hook created `custom_components/coway/manifest.json`; SHA-256
`1dd893160a93b57a70e3177475d1157315207efe2bb6fd47a08f84e820f9e9a9` matched
the manifest extracted directly from the pinned archive. The disposable
container was stopped. No generated `__pycache__` directory remains in the
repository.

The source fixture is redacted and synthetic; no Home Assistant, Coway, or GHCR
credentials were used. Only the Trivy gate, SBOM/provenance attestations, and
full-SHA GHCR publication remain pending because those workflow steps require a
merge to `main`. Record the successful workflow run URL and published manifest
digest here after that run.

## Rollback and handoff

IE-003 changes no cluster, account, device, or persistent Home Assistant state.
Rollback is deletion/reversion of the files listed above. A locally built image
is disposable. Published full-SHA tags must remain immutable evidence; do not
retag them. IE-004 should deploy a reviewed published image by manifest digest,
retain the prior manifest digest, and use that prior digest for rollback.

IE-004 is the next unblocked package after the pending supply-chain CI run
succeeds. It
owns `/config`, the PVC, GHCR pull secret, k3s workload, private ingress, Argo CD
selection, live persistence proof, and deployed-image rollback. IE-003 did not
create or modify any Kubernetes object.
