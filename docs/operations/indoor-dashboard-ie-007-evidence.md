# IE-007 Nest Evidence

Date: 2026-07-21

Result: **LIVE; CLOUD-LOSS ACCEPTANCE PENDING**. IE-004 is live. The owner
completed Google Device Access/OAuth/Pub/Sub linking, and the official Nest
integration is configured as `Living Room Nest` in `Living Room`. No Google
account, project, OAuth, device, Home Assistant entity, or credential identifier
was printed or recorded.

## Repository preparation

- `home-assistant/nest/contract.json` fixes the six canonical aliases, official
  integration/API dependency, normalized states, and fail-closed empty live
  capabilities.
- `home-assistant/nest/test-contract.sh` checks the contract against IE-001 and
  rejects common credential, vendor-ID, and raw-entity-ID assignments.
- `docs/operations/nest-living-room.md` defines the owner gate, current official
  setup path, capability discovery, safe control tests, cloud-loss behavior, and
  scoped rollback.

## Evidence available before authorization

The thermostat reported plausible temperature and humidity. Its registry
advertised `heat`, `cool`, `heat_cool`, and `off`; 50–90°F limits; single and
range setpoints; fan on/off; and Eco preset. The dashboard contract intentionally
omits Eco because it is not an approved IE-001 command.

Owner-reviewed Developer Tools tests proved every approved mode, HEAT/COOL/RANGE
setpoint shapes with 1°F changes, and fan start/cancel. Fan on produced a
12-hour timeout, so the only allowlisted durations are `720` (start) and `0`
(cancel). A combined mode-and-temperature call changed mode but left the prior
setpoint unchanged; future gateway logic must converge mode first and submit a
separate setpoint call. Every test was confirmed from a subsequent cloud state,
and the thermostat was restored to `heat_cool`, 66–69°F, fan off.

Initial live Home Assistant inspection emitted only these redacted facts:

```text
nest_config_entries=0
nest_state=not_configured
```

## Remaining completion evidence

- Cloud-loss transition to unavailable/null current values, independent-source
  continuity, and fresh recovery without fabricated state.

Rollback removes only the official Nest HA entry and authorization/private
credentials. It must not modify Aranet, ESPHome, Coway, or their network paths.
