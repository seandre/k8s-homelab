# IE-008 Coway live-onboarding evidence

Date: 2026-07-21

Result: **PREPARED; OWNER CREDENTIAL GATE PENDING**. IE-002 verified the pinned
integration and synthetic Airmega 250S entity behavior. IE-004 is live. No
IoCare credential, account data, vendor/device identifier, or raw Home Assistant
entity ID was requested or recorded.

## Repository preparation

- `home-assistant/coway/contract.json` fixes the two canonical devices and all
  public aliases while keeping every live capability empty and unobserved.
- `home-assistant/coway/fixtures/capabilities.pending.json` is the fail-closed
  redacted fixture used until both physical units pass independently.
- `home-assistant/coway/test-contract.sh` checks aliases, candidate value safety,
  fail-closed state, documentation, and common secret/identifier leakage.
- `docs/operations/coway-live-onboarding.md` defines the credential gate,
  independent control matrix, restoration, outage behavior, and rollback.

## Live observations

Live integration presence is recorded only as a redacted count. Capability
observations remain empty until owner-authorized onboarding and physical tests.

```text
iocare_config_entries=0
iocare_state=not_configured
```

## Required completion evidence

- Owner enters IoCare+ credentials directly into Home Assistant.
- Both devices are named and assigned to their approved rooms.
- Each unit independently passes power, speeds 1–3, advertised presets, timer,
  light, lock, sensitivity, AQI, PM2.5, PM10, and filter-state checks.
- Absent or unreliable entities are disabled and captured as unsupported.
- Original physical settings are restored after each unit's tests.
- Coway cloud loss yields unavailable/null current state without affecting Nest
  or local Aranet readings, followed by fresh recovery.
- The redacted live capability fixture replaces the pending fixture only after
  all observations above pass.

Rollback removes only the Coway IoCare Home Assistant entry and its private
credentials. Repository rollback removes this package's files and does not
change either purifier or the image-baked integration.
