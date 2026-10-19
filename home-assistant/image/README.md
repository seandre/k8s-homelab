# Production Home Assistant image (IE-003)

This directory defines the production Home Assistant image only. The base is
the official Home Assistant `2026.7.2` image pinned by tag and digest in
`image.lock` and the `Dockerfile`. The Coway IoCare `0.6.3` component
is accepted only from the commit archive and SHA-256 lock owned by IE-002. HACS
is not installed or used. The verified component retains the local token-refresh
patch, and CowayAIO 0.2.6 includes the upstream HTML parsing fix needed after
Coway changed its cloud responses in September 2026.

The manifest dependency `cowayaio==0.2.6` is installed without dependency
resolution from its sole PyPI source distribution using the SHA-256 in
`requirements.lock`. Its runtime dependencies are already supplied by the
digest-pinned Home Assistant base; the image verification suite proves imports.

The component is stored immutably under
`/usr/local/share/homelab-home-assistant`. Home Assistant's `/config` directory
will be a writable PVC in IE-004, so an s6 init hook replaces its runtime Coway
copy from the baked source on every container start. The hook does not contain
credentials or contact Coway.

## Local verification

Download and verify the archive, generate an ephemeral context, and run the
non-container tests:

```sh
work_directory=$(mktemp -d)
home-assistant/image/fetch-source.sh "$work_directory/coway.tar.gz"
home-assistant/coway-compat/test-verifier.sh "$work_directory/coway.tar.gz"
home-assistant/image/test-context.sh "$work_directory/coway.tar.gz"
home-assistant/image/prepare-context.sh \
  "$work_directory/coway.tar.gz" "$work_directory/context"
docker build --tag homelab/home-assistant:ie003 "$work_directory/context"
docker run --rm --entrypoint /usr/local/bin/verify-home-assistant-image \
  homelab/home-assistant:ie003
```

The generated context and downloaded archive are temporary and must not be
committed. CI repeats source verification, HA configuration validation, Coway
import/config-flow/entity tests, the image build, and Trivy HIGH/CRITICAL scans
of both the pinned official base and derived image. CI preserves both reports
and blocks any finding introduced by the derived image. Inherited official-base
findings remain visible and are re-evaluated whenever the HA digest changes.
Main-branch builds publish only `sha-<full-git-sha>` to
`ghcr.io/<repository-owner>/k8s-homelab-home-assistant`, with BuildKit SBOM and
maximum-mode provenance attestations. No `latest` or mutable release tag is
published.

IE-004 owns the runtime HA configuration, Kubernetes workload, GHCR pull
credentials, deployed image digest, and rollback exercise.

## Maintenance-notice compatibility

The generated component uses `coway-client.py` to tolerate the specific
unchecked regex-match failure in cowayaio 0.2.6's optional maintenance notice
parser. Valid maintenance windows, authentication errors, network failures,
and polling maintenance responses retain their upstream behavior. Command
maintenance exceptions are translated to CowayError so the integration can
report recoverable HA errors and isolate failures per device. The image
verification suite runs `test-maintenance-notice.py` against the pinned client.

Until a new immutable image is published, `coway-compat-configmap.yaml` supplies
the same helper and `install-coway-compat.sh` through a startup overlay. It runs
after the image's component installation on every container start. Regenerate
that ConfigMap after changing either file:

```sh
kubectl create configmap home-assistant-coway-compat -n home-assistant \
  --from-file=client.py=home-assistant/image/coway-client.py \
  --from-file=install.sh=home-assistant/image/install-coway-compat.sh \
  --dry-run=client -o yaml > kubernetes/apps/home-assistant/coway-compat-configmap.yaml
```

Remove the overlay mounts, volume, and ConfigMap only after deploying an image
that contains the helper. Rolling back the compatibility fix requires removing
the overlay and restarting Home Assistant with the previous image.
