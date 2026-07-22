# Indoor alert operations

IE-009 owns notification-only Home Assistant automations. It never calls a
climate, fan, switch, light, purifier, or other equipment-control service.

## Runtime mapping gate

After the package is deployed, an owner enters each verified sensor's Home
Assistant entity ID into the matching `Indoor map` helper and enters exactly one
Companion App notifier service in `Indoor alert mobile notifier`. These values
stay in Home Assistant's writable runtime state and must not be committed,
printed in evidence, or included in a browser response. The notifier must match
`notify.mobile_app_*`; other service names fail closed.

The Aranet mappings drive Living Room CO2, temperature, humidity, and battery.
Each Coway maps PM2.5 and both filter percentages; filter life is their
conservative minimum. Nest temperature is used only as its cloud-source
heartbeat. Stable raw cloud values are not considered current indefinitely:
the clock-triggered normalization uses Home Assistant's `last_reported` (with a
safe `last_updated` compatibility fallback), emits no normalized numeric value
once stale, and marks Aranet stale after 180 seconds and Nest
or Coway stale after 300 seconds. Numeric alerts pause while freshness is not
`CURRENT`; source incidents then warn after five minutes, escalate after thirty,
and recover after five fresh minutes.

IE-014 reports completed backup attempts with `indoor_backup_result`, containing
only `target: local|pbs` and `result: success|failed`. The first failed run warns
once per incident; further failures deduplicate until a success recovers it;
36 hours without success escalates; the next success recovers.

Every notification offers exactly one URI action, which opens `/indoor`. It has
no service-call action and cannot operate a device.

## Verification

```sh
home-assistant/alerts/test-alerts.sh
home-assistant/k3s/test-manifests.sh
git diff --check
```

Before enabling live delivery, use HA Developer Tools to fire synthetic source
and backup events and confirm one warning, no duplicate at the same severity,
one critical escalation, and one recovery. Confirm tapping the notification only
opens `/indoor`. Do not exercise live environmental thresholds by changing
equipment.

## Rollback

Revert the IE-009 package commit. Argo removes the alert ConfigMap mount and the
`packages` include. Runtime helpers become orphaned state only and can be removed
through Home Assistant after rollback. No device state is changed.
