# Living Room Nest

Status: **live; cloud-loss acceptance pending**. The official Home Assistant
Nest integration is configured and its live read/control contract is verified.
Never put a Google Cloud project ID, Device
Access project ID, OAuth client data, authorization code, token, Google device
ID, or raw Home Assistant entity ID in Git, chat, screenshots, fixtures, logs,
or handoff notes.

Home Assistant's [official Nest integration](https://www.home-assistant.io/integrations/nest/)
uses Google's Smart Device Management API and Cloud Pub/Sub. It is cloud
dependent. This package does not add YAML, a custom component, a direct Google
client, or a second device-control authority.

## Fixed normalized contract

The device is `nest_living_room`, displayed as `Living Room Nest`, and assigned
to `Living Room`. The only public aliases are:

| Alias | Meaning |
|---|---|
| `nest_living_room.current_temperature` | Current temperature normalized to Fahrenheit |
| `nest_living_room.humidity` | Current relative humidity percent |
| `nest_living_room.hvac_mode` | Normalized `OFF`, `HEAT`, `COOL`, or `HEAT_COOL` when advertised |
| `nest_living_room.heat_setpoint` | Fahrenheit heat setpoint when advertised |
| `nest_living_room.cool_setpoint` | Fahrenheit cool setpoint when advertised |
| `nest_living_room.fan_timer` | Fan timer end time when advertised |

The live thermostat advertises all four allowed HVAC modes, HEAT/COOL/RANGE
setpoints from 50–90°F in verified 1°F increments, and fan on/off. Fan on uses
the thermostat's observed 720-minute timer; `0` cancels it. The gateway must not
offer any other duration. It must not add a new alias or expose a private
mapping.

## Owner gate

This flow involves a non-refundable Google fee, account authorization, and
credentials, so the owner must perform it in the Home Assistant and Google UIs:

1. Use the consumer Google account that owns the thermostat. Google Workspace
   and Advanced Protection accounts are not supported for this integration.
2. In Home Assistant, open **Settings > Devices & services > Add Integration >
   Nest** and follow its current guided setup.
3. Create or select a Google Cloud project. Enable **Smart Device Management
   API** and **Cloud Pub/Sub API**.
4. Configure an External OAuth app, add the owning account as a test user, and
   set its publishing status to Production to avoid seven-day test expiry.
5. Create Web application OAuth credentials with exactly the redirect URI shown
   by Home Assistant. Enter the client ID and secret only into Home Assistant.
6. Register for Device Access if needed. Google currently charges a one-time,
   non-refundable US$5 fee. Confirm the correct account before paying because
   Google does not permit changing the account attached to that registration.
7. Create the Device Access project using the same OAuth client. Configure the
   Pub/Sub topic and grant only its documented publisher role as directed by the
   Home Assistant flow.
8. Complete Google account linking. Grant access and control only for the Living
   Room thermostat. Do not paste any identifier, code, or credential into chat.
9. In Home Assistant, name the device `Living Room Nest`, assign it to `Living
   Room`, and report only that setup completed or the redacted error category.

The owner completed this gate on 2026-07-21.

The authoritative click sequence and troubleshooting guidance remain the
official Home Assistant page. If its UI differs from this summary, stop and use
the current official instructions rather than guessing.

## Live acceptance after the gate

Use Home Assistant Developer Tools and record only normalized capabilities,
values, timestamps, and outcomes:

1. Confirm current temperature and humidity update, have plausible units and
   values, and receive a new cloud observation after a thermostat-side change.
2. Record the climate entity's advertised HVAC modes, supported setpoint shape,
   minimum, maximum, and step. Mark absent modes and shapes unsupported.
3. Exercise every advertised HVAC mode and restore the original mode. Wait for
   the Home Assistant state to converge after each command.
4. Exercise each advertised setpoint shape with a small safe in-range change,
   confirm convergence, then restore the original setpoint(s).
5. If the official integration advertises fan timer support, test only its
   advertised duration values, verify the timeout sensor, then cancel/restore
   the timer. Otherwise mark `fan_timer` `NOT_SUPPORTED` and omit the control.
6. Temporarily block only the HA-to-Google Internet path. After the measured
   freshness window, source state becomes `UNAVAILABLE`, every current value is
   `null`, and all Nest controls reject without calling Home Assistant. Cached
   numbers may appear only as stale history. Restore access and require a new
   observation before declaring recovery.
7. Verify Aranet and Coway sources remain independently available throughout the
   Nest failure test.

Every change is owner-initiated through Home Assistant. This package adds no
automation and does not operate equipment automatically.

## Verification and rollback

```sh
home-assistant/nest/test-contract.sh
git diff --check
```

Rollback is scoped to the Nest entry: remove the official Nest integration from
Home Assistant, revoke its Partner Connections authorization, and remove the
associated Home Assistant application credential. Cloud project deletion is a
separate owner decision and is not required to disable HA access. Repository
rollback removes only this contract, test, runbook, and evidence file; it does
not change Google or Home Assistant state.
