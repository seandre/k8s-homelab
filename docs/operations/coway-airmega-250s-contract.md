# Coway Airmega 250S compatibility contract

Status: **IE-002 source contract verified** for upstream Coway IoCare `0.6.3`
at commit `5a75b75db64b6ec82d0d985e704dbb43419a2932`, with archive SHA-256
`d379c2faa4bcdac783f62127bcad35ec5186e261e5caa3d89365e72986721d5d`.
The compatibility target is Home Assistant Core `2026.7.2`; the integration
manifest pins `cowayaio==0.2.6`.

The September 2026 update adopts the upstream HTML parsing fix. The older
client could fail to parse Coway's response while HA retained cached power and
mode values, so those values were insufficient evidence of successful control.

## Night and daytime schedule

`home-assistant/coway/night-schedule.yaml` keeps both units at manual level 2
with `AQI Off` from 22:00 until 07:00 in `America/Los_Angeles` time. At 07:00,
restore power, Smart mode (`Auto` in HA), and lights `On`, including the AQI
indicator. Startup and recovery checks restore whichever policy applies now.
A mismatch that remains actionable for thirty seconds triggers correction;
five-minute checks recover from missed transitions and external overrides.
Commands are sent only when needed. `Auto (Eco)` and automatic daytime fan
speed changes are valid Smart operation and are never overridden.

Each purifier recovers independently. Unavailable units are skipped; maintenance
command failures are translated into recoverable HA errors so the other unit
can proceed. Each action checks the time again to avoid crossing schedule
boundaries. A ten-minute mismatch or outage raises a persistent HA notification
and uses the existing private mobile alert route. Missing discovery is a
mismatch, rather than a successful empty-target run. Recovery dismisses the
persistent notification after both units match the policy.

The production image verification runs `test_schedule.py` with HA's actual
script engine and synthetic devices. It covers off-to-on restoration, manual
and Night modes, Eco idling, unavailable devices, failed power commands, and
both schedule boundaries without operating physical devices.

The test fixture contains only synthetic values and redacted identifiers. No
Coway account, device ID, serial, MAC address, or password is stored in Git.

## Entity contract

Home Assistant derives entity IDs from the operator-assigned device and entity
names. Entity IDs therefore are not stable contract values and must not be placed
in Homepage payloads. The display name, platform, unique-ID suffix, availability,
and control surface below come directly from the pinned source.

| Display name | Platform | Unique-ID suffix | 250S behavior |
|---|---|---|---|
| Purifier | `fan` | `_purifier` | Always created. Power, three manual speeds, and presets. |
| Current timer | `select` | `_timer` | Always created. `OFF`, `1 Hour`, `2 Hours`, `4 Hours`, `8 Hours`. Setting requires power on. |
| Light | `select` | `_light` | Always created for 250S. `On`, `Off`, `AQI Off`. Setting requires power on. |
| Smart mode sensitivity | `select` | `_smart_mode_sensitivity` | Always created. `Sensitive`, `Normal`, `Insensitive`. Setting requires power on. |
| Button lock | `switch` | `_button_lock` | Always created for 250S. Lock/unlock requires power on. |
| Pre filter | `sensor` | `_pre_filter` | Always created; percent remaining. |
| MAX2 filter | `sensor` | `_max_filter` | Always created; percent remaining. |
| Timer remaining | `sensor` | `_timer_remaining` | Always created; `HH:MM` string. |
| AQI | `sensor` | `_aqi` | Created when `air_quality_index` is reported. Numeric HA AQI measurement. |
| Particulate matter 2.5 | `sensor` | `_particulate_matter_2_5` | Created when PM2.5 is reported and the API `product_name` is not exactly `AIRMEGA`; µg/m³. |
| Particulate matter 10 | `sensor` | `_particulate_matter_1_0` | Created when PM10 is reported; µg/m³. The unusual upstream unique-ID suffix is preserved. |
| Indoor air quality | `sensor` | `_indoor_aq` | Created when `aq_grade` is reported: `Good`, `Moderate`, `Unhealthy`, or `Very Unhealthy`. |
| Lux | `sensor` | `_lux` | Created when `lux_sensor` is reported. The 250S value is `max(1022 - raw, 0)` lux. |
| Pre-filter wash frequency | `select` | `_pre_filter_frequency` | Created only if the API returns a non-null frequency. Upstream documents the endpoint as temporarily unavailable for 250S. |

All entities report unavailable when the purifier's Coway cloud
`network_status` is false. The fan is the power entity; there is no separate
power switch. There are no integration-specific services in `services.yaml`.

### Fan values and actions

Manual device speeds `1`, `2`, and `3` map to Home Assistant percentages `33`,
`66`, and `100`. Zero turns the purifier off. The advertised normal 250S presets
are `Auto`, `Night`, and `Rapid`.

When the Coway API reports fan speed `9`, the entity reports preset
`Auto (Eco)` and percentage zero. Upstream also includes `Auto (Eco)` in
`preset_modes` in that state, but its setter deliberately raises an error if a
caller tries to select it. Treat `Auto (Eco)` as report-only and never advertise
it as an allowed command.

The supported Home Assistant entity services are:

| Service | Allowed 250S shape | Important precondition |
|---|---|---|
| `fan.turn_on` | target fan; optional `percentage` | Percentage must be `33`, `66`, or `100` in the indoor gateway. |
| `fan.turn_off` | target fan | Cloud source must be current/available. |
| `fan.set_percentage` | target fan and `percentage` in `0`, `33`, `66`, `100` | `0` powers off. |
| `fan.set_preset_mode` | target fan and `preset_mode` in `Auto`, `Night`, `Rapid` | Never send `Auto (Eco)`. |
| `select.select_option` | target select and one exact option from its entity allowlist | Timer, light, and sensitivity changes require purifier power on. |
| `switch.turn_on`, `switch.turn_off` | target Button lock switch | Purifier must be powered on. |

The Homepage control gateway must translate canonical aliases to private HA
entity IDs server-side. It must never accept the platform service name or entity
ID from a client.

## Compatibility and live-validation boundary

The IE-002 harness proves the component imports, the config flow presents and
redacts an authentication failure, and the synthetic 250S entity contract is
stable under HA `2026.7.2`. It makes no Coway network request.

IE-008 must confirm both physical units independently. In particular, verify the
account's actual `product_name` because the pinned PM2.5 creation condition is
surprising; verify which conditional sensors appear; and disable any entity that
is absent or unreliable. That live result may narrow supported capabilities but
must not invent or rename the source contract above.

## Rollback

IE-002 changes no live system. Remove the local compatibility image with the
normal Docker image-pruning workflow if desired. Reverting this directory and
this document removes the harness; no Home Assistant PVC or device state is
affected.
