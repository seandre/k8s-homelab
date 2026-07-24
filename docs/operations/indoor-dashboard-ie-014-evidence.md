# IE-014 — Backup, Restore, and Production Rollout

Status: COMPLETE on 2026-07-24.

## Backup contract

Home Assistant automatic backups run daily at 02:15 America/Los_Angeles,
retain seven local archives, and use Home Assistant's encrypted backup format.
The first observed local archive completed at `2026-07-24T21:41:33Z`.

The `home-assistant-pbs-backup` CronJob runs daily at 03:00
America/Los_Angeles. It mounts `/config` read-only, has no Kubernetes API
token, runs as UID/GID 10001 with all capabilities dropped, and may reach only
cluster DNS, the fixed local Home Assistant webhook, and PBS
`192.168.40.34:8007`.

The PBS identity `home-assistant@pbs!k3s` has `DatastoreBackup` only on
`/datastore/pve02-backups/home-assistant`. Runtime credentials and the random
webhook ID exist only in Kubernetes and Home Assistant secrets; they are not
Git-owned. The webhook can submit only a validated PBS success/failure result
and is not a general Home Assistant API credential.

CI builds the PBS client from pinned inputs, runs ShellCheck and the backup
contract test, and publishes an SBOM/provenance-bearing SHA tag. Production is
pinned to image digest
`sha256:ac977ee392a896827f15ab4a8db3c73fc773644e235c34678038a026239363d4`.

## Live backup and restore evidence

The deployed CronJob acceptance run completed at `2026-07-24T22:45:16Z`.
PBS created `host/home-assistant/2026-07-24T22:45:16Z`; unchanged content was
fully deduplicated (1.983 MiB reused). Home Assistant recorded the PBS backup
helper as `ok` at the same timestamp. An earlier PBS client restore reproduced
the encrypted archive with an identical SHA-256 checksum.

A separate 10 GiB `local-path` PVC and isolated Home Assistant Deployment were
then created. The production encrypted archive was uploaded through the
onboarding restore flow. Home Assistant logged `Restore complete, restarting`.
After attaching the same Git-owned bootstrap and packages used in production:

- Home Assistant configuration validation passed.
- The restored config-entry, entity, and device registries were present.
- Aranet, Coway, ESPHome, Nest, and mobile-app integration domains were present.
- The entity registry contained 165 entries, 75 indoor aliases, and 17 fixed
  indoor mapping helpers.
- Git-owned indoor automations and bootstrap configuration loaded successfully.
- The restored secrets file was present; no secret values were read or recorded.

The drill used only an isolated PVC. Production stayed online throughout.

## Failure and rollout evidence

The package-level outage evidence remains authoritative:

- Internet/Nest degradation: IE-007.
- Internet/Coway degradation: IE-008.
- Atom loss and recovery: IE-006.
- Home Assistant restart and truthful pending-action recovery: IE-010/IE-012.
- Prometheus unavailability renders missing history without fabricated current
  values: IE-010/IE-011.
- Git-only Homepage rollback and forward recovery: HP-030 in
  `docs/operations/homepage-rework.md`.

Production verification after the restore drill returned HTTP 200 for
`/indoor`; Homepage was 1/1 Ready; Argo CD reported Synced/Healthy at revision
`c8c4adffdd68a044147b47c0dff893d62001a5c5`.

## Operations and rollback

Inspect the scheduled path with:

```sh
kubectl -n home-assistant get cronjob home-assistant-pbs-backup
kubectl -n home-assistant get jobs
kubectl -n home-assistant logs job/<job-name>
```

Restore by creating a clean 10 GiB PVC, starting the digest-pinned Home
Assistant image without production ingress, uploading the latest encrypted
archive, and entering the owner-held emergency key. After Home Assistant
reports completion, attach the Git-owned bootstrap and packages, run
`python -m homeassistant --script check_config --config /config`, and validate
the integration domains, registries, mappings, and alerts before any cutover.

Rollback the backup automation by reverting the CronJob, NetworkPolicy, alert
bridge, and image-pin commits through Git. Do not delete the production PVC,
PBS namespace, or encrypted archives during rollback. Revoke the PBS token and
random webhook only when intentionally decommissioning the backup path.

## Handoff

Changed files are the backup image and tests under `home-assistant/backup`, the
backup event bridge in `home-assistant/alerts`, the rendered alert ConfigMap,
the CronJob and NetworkPolicy, CI workflow, baseline status, and this evidence
record. No unresolved implementation observations remain.
