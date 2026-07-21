# IE-002 Coway compatibility evidence

Date: 2026-07-21

Result: **PASS**. The unchanged Coway IoCare `0.6.1` component imports and its
synthetic Airmega 250S contract passes against Home Assistant Core `2026.7.2`.
No fallback patch or `pycoway` migration was required.

## Immutable inputs and image evidence

- Upstream commit: `e0f29953f650b09c8d994aafba5c27634e0bb705`
- Upstream archive SHA-256:
  `0a36be24d7294319880d1aa0cc6b6fcd9a66b8f2d08192bfd04b92c42204aaf5`
- Integration manifest: `0.6.1`, requiring `cowayaio==0.2.4`
- Test base: `ghcr.io/home-assistant/home-assistant:2026.7.2`
- Digest resolved by Docker during the passing run:
  `sha256:1476924357b46e80735c13e94232ba5c853cac052e9df4bb28d50fa56348097b`
- Local compatibility image: `homelab/coway-compat:0.6.1-ha2026.7.2`

The tag/digest observation above is test evidence, not the IE-003 production
base-image decision. IE-003 must perform and record its own immutable base pin.

## Changed files

- `home-assistant/coway-compat/source.lock`
- `home-assistant/coway-compat/verify-source.sh`
- `home-assistant/coway-compat/test-verifier.sh`
- `home-assistant/coway-compat/run-tests.sh`
- `home-assistant/coway-compat/Dockerfile`
- `home-assistant/coway-compat/README.md`
- `home-assistant/coway-compat/tests/test_compatibility.py`
- `home-assistant/coway-compat/tests/fixtures/airmega_250s.json`
- `docs/operations/coway-airmega-250s-contract.md`
- `docs/operations/indoor-dashboard-ie-002-evidence.md`

## Verification performed

```sh
sh -n home-assistant/coway-compat/verify-source.sh
sh -n home-assistant/coway-compat/test-verifier.sh
sh -n home-assistant/coway-compat/run-tests.sh
home-assistant/coway-compat/test-verifier.sh /tmp/home-assistant-iocare-0.6.1.tar.gz
python3 -m py_compile home-assistant/coway-compat/tests/test_compatibility.py
home-assistant/coway-compat/run-tests.sh /tmp/home-assistant-iocare-0.6.1.tar.gz
```

The verifier test passed pristine extraction, corrupted-checksum rejection, and
checksum-valid traversal-path rejection. The container suite passed four tests:
all component imports, config-flow form/auth-error redaction, the synthetic 250S
entity contract, and report-only `Auto (Eco)` handling.

The first container run failed one assertion and provided useful compatibility
evidence: Home Assistant maps the second of three ordered speeds to `66`, not
`67`. The contract and assertion were corrected to `33`, `66`, `100`; the full
image build and test suite then passed.

`shellcheck` was unavailable locally; POSIX shell parsing with `sh -n` passed.

## Unresolved and live-validation observations

No live Coway API or physical purifier was used in IE-002, and no credentials
were requested. IE-008 must verify each unit independently. The highest-risk live
observations are the source's unusual PM2.5 `product_name != "AIRMEGA"` creation
condition, conditional AQI/PM10/lux entities, and the temporarily unavailable
250S pre-filter-frequency endpoint.

`Auto (Eco)` is intentionally report-only even though upstream may include it in
the fan entity's advertised presets while that state is active. Downstream
control allowlists must exclude it.

## Rollback and handoff

IE-002 changes no cluster or Home Assistant state. Revert the files above to
remove the harness. The local test image can be deleted through the operator's
normal Docker image cleanup; it has no persistent volume.

IE-003 is now unblocked. It should copy the verified component from the exact
archive only after running `verify-source.sh`, preserve the source unchanged,
pin its production Home Assistant base by digest, and rerun this suite as part of
its image CI.
