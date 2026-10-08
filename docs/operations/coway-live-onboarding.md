# Coway Airmega 250S live onboarding

Status: **live; stale-state guard pending**. Both physical purifiers passed
the independent read/control matrix through Home Assistant's API and were
restored to their original settings.
Verified cloud loss stopped observations and produced connection errors, but
raw HA retained cached values. Public reads and controls therefore remain gated
on a Git-owned freshness guard that emits null and rejects commands while stale.

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

The owner completed this gate on 2026-07-21.

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

## Overnight schedule

`home-assistant/coway/night-schedule.yaml` owns the daily schedule in Home
Assistant's `America/Los_Angeles` timezone:

- At 22:00, set each purifier to manual level 2 (66%), cancel any countdown
  timer, and select `AQI Off`.
- Keep those settings until 07:00. There is no periodic overnight command loop.
  A Home Assistant restart only corrects settings that differ; a purifier
  already at level 2 with AQI off receives no commands.
- At 07:00, restore Auto and lights On once. Auto (Eco) is already a valid
  daytime state and is left alone.

Each purifier is handled independently. An unavailable purifier or a failed
command does not block the other unit. Fan speed selection powers on an off
purifier itself, so the schedule does not send a redundant power-on command.
AirGradient brightness remains 5 overnight and 80 from 07:00.

Disable conflicting IoCare schedules before removing an existing overnight
recovery loop. Home Assistant history on 2026-10-07 showed both units powering
off around 03:30, followed by the recovery automation powering them back on
around 03:31 and changing their lights. The same sequence recurred on the
previous five nights. The old morning automation also selected Auto and lights
On at 06:30. Changing only Home Assistant's morning time cannot prevent a
separate Coway-side shutdown.

During the 2026-10-07 repair, authenticated reads of both Coway schedule
endpoints (the primary API and the app proxy) returned successful, empty
schedule lists for both units. Both countdown timers also reported `OFF`.
There were no saved Coway schedules to disable at that point; the source of
the earlier 03:30 shutdown was not confirmed by these current-state reads.
The Home Assistant fix removes the repeating recovery commands and the
06:30 morning transition. Recheck device history after the next night if a
shutdown recurs, including any external app schedules.

Regenerate the ConfigMap with `home-assistant/alerts/render-configmap.sh` after
editing the schedule. Run `home-assistant/coway/test-contract.sh`, then run
`home-assistant/coway/test_schedule.py` in the production Home Assistant Python
environment. The tests exercise HA's actual script engine with synthetic
devices, covering the midnight window, 06:30–07:00, restart idempotence,
unavailable units, and countdown cancellation. Validate the configuration
before deployment, then reload automations after the ConfigMap volume
updates. Remove the retired `coway_night_level_2_guard` automation if it is still
present in the active configuration.

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
