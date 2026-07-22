# Living Room Aranet4

Status: **owner gate pending**. The local Atom/ESPHome Bluetooth path is healthy,
but Home Assistant has no configured Aranet integration yet. Do not record a
Bluetooth address, serial number, vendor ID, or raw Home Assistant entity ID in
Git, screenshots, fixtures, logs, or handoff notes.

The [official Home Assistant Aranet integration](https://www.home-assistant.io/integrations/aranet/)
is local-push and discovers an Aranet4 through a working Bluetooth integration.
It requires Aranet firmware 1.2.0 or newer and **Smart Home Integration** enabled
in the Aranet Home app. Home Assistant also documents ESPHome devices as
[supported remote Bluetooth adapters](https://www.home-assistant.io/integrations/bluetooth/#remote-adapters).

## Fixed normalized contract

The device is `aranet_living_room`, displayed as `Living Room Aranet4`, assigned
to `Living Room`, and transported only through `atom_living_room`. It is
read-only and exposes exactly these public aliases:

| Alias | Normalized unit |
|---|---|
| `aranet_living_room.temperature` | `CELSIUS` |
| `aranet_living_room.humidity` | `PERCENT` |
| `aranet_living_room.pressure` | `HPA` |
| `aranet_living_room.co2` | `PPM` |
| `aranet_living_room.battery` | `PERCENT` |

The private server-side mapping to Home Assistant entities is created later; it
must never be sent to the browser. Unit conversion belongs at that boundary.
The Aranet has no control commands.

## Owner gate

On the approved phone, with the Aranet nearby:

1. Open Aranet Home, select the Living Room Aranet4, and open device settings.
2. Confirm the displayed firmware is at least `1.2.0`; install the offered
   firmware update first if it is older.
3. Enable **Smart Home Integration**. Leave Bluetooth enabled and keep the
   Aranet near the powered Living Room Atom.
4. Report only the firmware version and that the toggle is enabled. Do not send
   a device details screenshot or any hardware identifier.

Stop here until the owner confirms both facts.

## Home Assistant onboarding after the gate

1. In Home Assistant, open **Settings > Devices & services**. Confirm Bluetooth
   shows the Living Room ESPHome proxy as a remote scanner.
2. Configure the discovered **Aranet** card. If no card appears after two normal
   Aranet measurement intervals, choose **Add Integration > Aranet** and follow
   the official flow. Do not add YAML, a custom integration, or cloud access.
3. Rename the device `Living Room Aranet4` and assign it to `Living Room`.
4. Privately map the five resulting sensors to the fixed aliases above. Disable
   unexpected diagnostic entities from later export; do not rename raw IDs into
   a public API contract.

## Live acceptance

Record redacted timestamps and values, never identifiers.

1. Observe at least three successive updates for all five readings. Record the
   longest observed update interval as the source cadence. Values and units must
   be plausible, and observation timestamps must advance.
2. Block Internet access for the test client/path while leaving LAN routing and
   Atom power intact. All five readings must remain current and continue to
   update locally.
3. Remove power from only the Atom. After Home Assistant detects proxy loss, the
   Aranet source must become `UNAVAILABLE` (or its last observation `STALE`),
   and every current value is `null`. A cached numeric value may be retained only
   as explicitly stale history; it must not be emitted as current.
4. Restore Atom power. Confirm the encrypted ESPHome API reconnects and all five
   readings receive new timestamps without restarting Home Assistant.
5. Measure the loss and recovery delays and retain them in the IE-006 evidence.
   IE-009/IE-011 must use a freshness window longer than the measured normal
   cadence and shorter than the observed loss-detection bound.

If one of the required five readings is absent, leave IE-006 incomplete and
investigate before changing the canonical contract. Never fabricate a zero or
substitute a different device's reading.

## Verification and rollback

```sh
home-assistant/aranet/test-contract.sh
git diff --check
```

Rollback is UI-local: remove only the Aranet integration entry and its private
alias mapping. Do not remove Bluetooth, ESPHome, the Atom integration, its
network route, or unrelated integrations. Repository rollback removes this
contract/runbook/evidence change only; it does not alter live Home Assistant.
