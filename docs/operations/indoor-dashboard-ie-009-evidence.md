# IE-009 alert evidence

Date: 2026-07-22

Result: **COMPLETE**. IE-006 is complete and the
verified IE-007/IE-008 cloud-loss evidence is incorporated: raw Home Assistant
retains cached Nest and Coway values, so threshold evaluation is freshness-gated
and source-loss incidents are independent.

## Implemented contract

- Git-owned HA package covers CO2, temperature, humidity, each Coway PM2.5,
  Aranet battery, each Coway's minimum filter life, all four device sources, and
  local/PBS backup results and age.
- Persistent incident helpers deduplicate repeated samples and repeated failed
  backup runs until recovery. Critical-first input
  emits one warning before its one escalation; critical-to-warning de-escalation
  is silent; a qualified recovery emits once.
- Mobile delivery accepts only a runtime `notify.mobile_app_*` service and only
  `/indoor`. No notification or automation invokes equipment control.
- Device entity mappings are runtime-only. Git contains canonical helper names,
  never raw device entities, vendor identifiers, or credentials.
- Freshness prefers HA's report timestamp and safely falls back for compatibility;
  stale normalized sensors emit no numeric state. The ConfigMap mounts atomically
  at `/config/packages`, so no pre-existing PVC directory is required.

## Tests

`home-assistant/alerts/test-alerts.sh` deterministically exercised every incident
through repeated warning, repeated critical, de-escalation, and repeated recovery
and observed exactly `warning, critical, recovery`. It also checks the sole URI,
rejects equipment-control service patterns and identifier-like raw entities, and
proves generated package/config-map output is reproducible.
It additionally rejects last-updated-only age comparisons, stale numeric
emission, and repeated backup warnings within one unresolved incident.

`home-assistant/k3s/test-manifests.sh` and `git diff --check` are required in the
handoff.

## Live mobile acceptance

On 2026-07-22, Home Assistant reported exactly one enabled Companion App
registration. Its notifier was bound through the runtime-only helper and a
synthetic `mobile_delivery_test` warning was emitted through the package's
`indoor_alert_notification` boundary. The owner confirmed receipt on the phone.
The notification contained only the package-defined `/indoor` URI action; it
contained no device-control action.

The temporary API token used for the runtime binding and event submission was
deleted immediately after the test. Home Assistant reported zero matching token
records afterward, and the local clipboard was cleared. No notifier identifier,
token, raw entity ID, or mobile device identifier was recorded in Git or this
evidence.

The pinned production Home Assistant `2026.7.2` image also accepted the complete
package through `python -m homeassistant --script check_config -c /config` under
offline amd64 emulation. The only output beyond the successful configuration
test was an upstream Python `SyntaxWarning`; no package error remained.

Rollback is the scoped IE-009 commit revert described in
`docs/operations/indoor-alerts.md`; it does not change equipment state.
