# IE-006 Aranet4 Evidence

Date: 2026-07-21

Result: **OWNER GATE PENDING**. IE-005 is complete. Home Assistant has one
configured ESPHome integration and one Bluetooth integration, but zero
configured Aranet integrations. The signed-in discovery card could not be
inspected through an available automation surface, so discovery is not claimed.

## Repository contract

- `home-assistant/aranet/contract.json` fixes the five normalized aliases,
  normalized units, local dependency, source/value states, and null unavailable
  behavior without a raw entity or hardware identifier.
- `home-assistant/aranet/test-contract.sh` checks that contract against the IE-001
  baseline and rejects common identifier assignments.
- `docs/operations/aranet4-living-room.md` defines the owner gate, official HA
  onboarding, local-operation test, Atom-loss truthfulness test, and rollback.

## Commands and live observations

```sh
home-assistant/aranet/test-contract.sh
home-assistant/esphome/test-config.sh
home-assistant/k3s/test-manifests.sh
git diff --check
```

The live integration-domain count was read inside the HA pod and reduced to
domain counts before output. No integration data, Bluetooth address, serial,
vendor identifier, raw entity ID, or secret was read into evidence.

## Remaining acceptance evidence

- Owner confirms firmware `>=1.2.0` and Smart Home Integration enabled.
- HA discovery/configuration and Living Room assignment.
- Three advancing samples for temperature, humidity, pressure, CO2, and battery.
- Measured source cadence and freshness/loss/recovery bounds.
- Continued updates with Internet blocked.
- Atom-loss stale/unavailable state with no fabricated current values.
- Automatic recovery after Atom power restoration.

Rollback removes only the Aranet HA entry/private mapping and this IE-006
repository change. The working ESPHome proxy and narrow network rules remain.
