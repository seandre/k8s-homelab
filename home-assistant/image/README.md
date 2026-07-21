# Production Home Assistant image (IE-003)

This directory defines the production Home Assistant image only. The base is
the official Home Assistant `2026.7.2` image pinned by tag and digest in
`image.lock` and the `Dockerfile`. The unchanged Coway IoCare `0.6.1` component
is accepted only from the commit archive and SHA-256 lock owned by IE-002. HACS
is not installed or used.

The manifest dependency `cowayaio==0.2.4` is installed without dependency
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
import/config-flow/entity tests, the image build, and a Trivy HIGH/CRITICAL scan.
Main-branch builds publish only `sha-<full-git-sha>` to
`ghcr.io/<repository-owner>/k8s-homelab-home-assistant`, with BuildKit SBOM and
maximum-mode provenance attestations. No `latest` or mutable release tag is
published.

IE-004 owns the runtime HA configuration, Kubernetes workload, GHCR pull
credentials, deployed image digest, and rollback exercise.
