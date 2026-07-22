# Coway Airmega 250S live onboarding

Status: **owner credential gate pending**. This runbook narrows the verified
IE-002 source contract using both physical purifiers. Nothing is supported in
the public contract until it has been observed on that individual unit.

## Fixed identity and safety rules

| Alias | Display name | Area |
|---|---|---|
| `coway_living_room` | Living Room Coway | Living Room |
| `coway_bedroom` | Bedroom Coway | Bedroom |

IoCare credentials are entered only into Home Assistant. Never record account
data, vendor/device identifiers, raw Home Assistant entity IDs, or integration
diagnostics in Git, screenshots, fixtures, logs, or handoff notes. Home
Assistant is the only control authority. These tests do not create automations.

The IE-002 candidates are not live capabilities. `Auto (Eco)` is report-only
and must never become a command. A missing, unreliable, or untested entity is
disabled and normalized as `NOT_SUPPORTED`; it is never inferred from the other
purifier.

## Owner gate

1. Confirm both Airmega 250S units are online and independently controllable in
   IoCare+.
2. In Home Assistant, open **Settings > Devices & services > Add integration**
   and select **Coway IoCare**.
3. Enter the existing IoCare+ credentials directly into Home Assistant. Do not
   paste them into chat, a shell, Git, a Secret manifest, or a screenshot.
4. Complete the flow once for the account. Name the two discovered devices
   `Living Room Coway` and `Bedroom Coway`, and assign their matching areas.
5. Report only that onboarding completed, or provide a manually redacted error
   that contains no account, device, entity, or credential identifier.

Stop here until the owner completes this gate.

## Independent live capability test

Start from both purifiers powered on and record their original settings in
private operator notes. Exercise exactly one purifier at a time while observing
the physical unit and its subsequent Home Assistant state. Restore every value
before moving to the other purifier.

For each purifier independently:

1. Confirm source availability and advancing observations for AQI, PM2.5, PM10,
   pre-filter life, and MAX2-filter life. The normalized `filter_life` mapping
   must explicitly document whether it uses one filter or a conservative
   minimum. Do not average filter values.
2. Toggle power off/on and confirm physical and cloud convergence.
3. Set manual speeds 1, 2, and 3, observing HA percentages 33, 66, and 100.
4. Test only the advertised commandable presets. Candidate presets are Auto,
   Night, and Rapid. Exclude `Auto (Eco)` even if it appears while reported.
5. While powered on, test timer options, all advertised light selections,
   button lock on/off, and every sensitivity option.
6. Observe timer remaining, indoor-air-quality grade, lux, and pre-filter wash
   frequency if present. These are private discovery observations unless a
   later public alias explicitly includes them.
7. Disable an entity in Home Assistant if absent, unreliable, or contradictory.
   Add only normalized aliases/options that passed to that unit's redacted
   fixture. Keep controls `{}` and `observed: false` until the unit completes.
8. Restore the exact original settings, then repeat for the second purifier.

Power-dependent controls must fail closed when the unit is off. A failed cloud
request, unavailable source, or stale expected state never triggers retries that
could unexpectedly operate the purifier.

## Failure and recovery acceptance

After both units pass independently, block only the Coway cloud path or otherwise
observe a genuine Coway outage without disrupting Aranet or Nest. Both purifiers
may fail account-wide, but each must produce `UNAVAILABLE` with current values
set to `null`; cached values may exist only as stale history. Restore access and
require a new successful observation before controls re-enable.

Record only redacted counts, normalized option slugs, result, latency, and
timestamps. A final capability fixture must contain aliases—not raw IDs—and must
represent partial/unsupported hardware truthfully.

## Verification and rollback

```sh
home-assistant/coway/test-contract.sh
home-assistant/coway-compat/run-tests.sh /path/to/pinned-0.6.1-archive.tar.gz
git diff --check
```

Rollback removes only the Coway IoCare config entry and its private credentials
from Home Assistant, then reverts the IE-008 contract/runbook/fixture files. It
must not modify the image-baked integration, either purifier's IoCare
registration, Nest, Aranet, ESPHome, or their network paths.
