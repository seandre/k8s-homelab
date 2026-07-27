# IE-015 AirGradient Production Rollout Evidence

Date: 2026-07-26  
Package: AG-009  
Status: **COMPLETE**

## Objective and prerequisites

This record closes the AirGradient ONE production migration after AG-004 alert
migration and AG-008 dashboard UI completion. It proves the strict schema-v4
read path, seven-metric history, five reviewed controls, immutable image
deployment, failure behavior, responsive UI, and Git-only rollback/forward
recovery.

The fixed interfaces remain:

- canonical device `airgradient_living_room` and source
  `AIRGRADIENT_LOCAL`;
- seven fixed read aliases and five fixed setting commands;
- Nest temperature authority, AirGradient CO2/humidity authority with Aranet
  fallback, and worst-current AirGradient/Living Room Coway PM2.5;
- existing `POST /api/v1/indoor/actions` and history endpoints only; and
- no automatic equipment operation from environmental readings.

Calibration, firmware changes, cloud sharing, configuration-authority changes,
arbitrary Home Assistant actions, new public identifiers, and expanded network
access remain excluded.

## Changed files and commits

| Commit | Change |
|---|---|
| `7fa4217` | Pin the tested Homepage schema-v4 OCI index digest. |
| `1acb49e` | Use Home Assistant `last_reported`, with `last_updated` fallback, so unchanged successful polls do not become falsely stale. |
| `24c891e` | Trigger the Git-owned Home Assistant rollout for the freshness fix. |
| `fa7ed6a` | Trigger the Git-owned Homepage rollout after installing runtime-only control authority. |
| `750f142`, reverted by `4b8736e` | Prove rollback to the prior immutable schema-v3 image and forward recovery. |
| `0ca8b03`, `dc55b75`, reverted by `0e4683b`, `ffcff62` | Prove Prometheus isolation and restoration through Git-owned NetworkPolicy and pod-template changes. |

Runtime-only Secrets contain the separate control token and private five-entity
mapping. Only their names, key names, and redacted capability shapes were
validated; no token, raw entity ID, device identifier, MAC address, or serial
number is stored in Git or this record.

## Build, scan, and deterministic verification

The GitHub image workflow for `bda61fe` completed successfully and published
`ghcr.io/seandre/k8s-homelab-homepage:sha-bda61fe` at OCI index digest
`sha256:2ce80474e684546da6e1593f82dae73fb6fbe280111f0a256f2c28183474d4b1`.
The workflow ran lint, both TypeScript builds, unit, integration, portable
Playwright, production build, container build, SBOM/provenance generation, and
the HIGH/CRITICAL Trivy gate with unfixed findings ignored.

Local verification results:

- ESLint: pass.
- TypeScript client and server builds: pass.
- Vitest: 38 files and 141 tests passed.
- Integration: 1 test passed.
- Playwright: 17 tests passed.
- Production client/server build: pass.
- Homepage and cluster Kustomize renders: pass.
- IE-004 k3s manifest contract: pass.
- AG-003 AirGradient normalization contract: pass.
- IE-009 deterministic incident and safety cases: pass.
- Diff whitespace and credential/redaction scans: pass.

The alert suite proves one warning, at most one escalation, and one recovery per
incident, plus source loss, fallback precedence, worst-current PM2.5, stale
exclusion, and Bedroom independence. TVOC and NOx remain informational.

## Redacted live acceptance

| Check | Result |
|---|---|
| Argo CD | `Synced` and `Healthy` at the final Git revision. |
| Production image | Expected immutable `sha-bda61fe` tag and OCI digest are live. |
| Public contract | Strict schema v4 is live; the canonical AirGradient device is `AVAILABLE`. |
| Current readings | Temperature, humidity, CO2, PM2.5, PM10, TVOC index, and NOx index are all numeric and `CURRENT`. |
| History | Seven aliases passed all six bounded windows, 42/42; custom-range and arbitrary-alias behavior remains covered by the 141-test suite. |
| Capabilities | Two integer 0–100 step-1 settings and three runtime option settings are advertised; all five controls are visible. |
| Controls | All five commands returned `SUCCEEDED` through the production gateway while requesting their existing values, so device configuration was unchanged. |
| Safety gates | Same-action replay returned the same action ID; stale version, invalid capability, wrong origin, wrong source network, and rate limit returned their fixed rejection codes. |
| Auditing | Six terminal live audits contained only canonical command/target/result/latency fields; token, private entity, device-address, and vendor-identifier scans passed. |
| Home Assistant restart | Git-triggered replacement recovered all seven readings as `CURRENT`; the rollout exposed and fixed the `last_updated` false-staleness defect. |
| Prometheus outage | With only Homepage-to-Prometheus egress removed and a fresh gateway process, all seven current readings remained available while history returned unavailable; Git reverts restored history HTTP 200. |
| Firewall isolation | Home Assistant reached the local device path; the unrelated Homepage workload was blocked. The AG-002 node-source allowlist and unrelated-server denial evidence remains controlling. |
| Internet/device loss | AG-002 already proved Internet-blocked local operation, device loss/reboot, truthful stale/unavailable state, recovery, and no unrelated Servers-to-IoT reachability; AG-009 did not weaken the fixed `/32` contract to repeat it. |
| UI | The AirGradient + Nest card, compact Aranet card, six graphs, and settings rendered with no horizontal overflow at 320×900, 768×1024, and 1440×1080. |
| Rollback | Git commit `750f142` deployed the prior immutable image and schema v3; Git revert `4b8736e` restored schema v4, seven current readings, five capabilities, and Argo health. |

Cloud sharing remains disabled and Home Assistant retains local configuration
authority. No acceptance step automatically operated a purifier, thermostat, or
other equipment.

## Operations, rollback, and observations

Rollback the production application by reverting the schema-v4 image-pin and
related configuration commits in Git, push the revert, hard-refresh Argo if its
repository cache has not rendered the new commit, and verify the actual live
image, schema consistency, and `Synced`/`Healthy` state. Forward recovery uses a
Git revert of the rollback commit. Leave the official Home Assistant integration
and runtime-only mappings intact unless the owner explicitly decommissions the
device.

Argo sometimes advanced `.status.sync.revision` before its repository cache
rendered the changed manifests. Acceptance therefore checked the actual live
image, pod-template annotations, NetworkPolicy ports, schema, and endpoint
behavior instead of trusting revision metadata alone.

There are no unresolved owner gates. The dedicated Home Assistant control token
must remain separate from the read adapter token and should be revoked if the
Homepage control gateway is decommissioned.

**Next unblocked package:** none.
