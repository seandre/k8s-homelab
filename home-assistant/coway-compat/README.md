# Coway compatibility harness (IE-002)

This harness tests the upstream Coway IoCare integration unchanged against Home
Assistant Core `2026.7.2`. It is not a production image and does not contact the
Coway API. No HACS content or credentials are used.

The immutable inputs are in `source.lock`. Obtain the archive from the URL shown
by the verifier, then run:

```sh
home-assistant/coway-compat/verify-source.sh /path/to/archive.tar.gz
home-assistant/coway-compat/test-verifier.sh /path/to/archive.tar.gz
home-assistant/coway-compat/run-tests.sh /path/to/archive.tar.gz
```

`run-tests.sh` verifies the archive before extracting it into an ephemeral Docker
build context. The resulting local image is
`homelab/coway-compat:0.6.1-ha2026.7.2`. Its default command runs import,
config-flow, redaction, Airmega 250S entity, and report-only Auto Eco tests.

The archive is never committed. A checksum failure, a path outside the expected
commit prefix, or a manifest pin different from `cowayaio==0.2.4` stops the build.

See `docs/operations/coway-airmega-250s-contract.md` for the verified entity and
service contract and the live checks deferred to IE-008.
