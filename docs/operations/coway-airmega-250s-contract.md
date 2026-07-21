# Coway Airmega 250S compatibility contract

Status: **IE-002 source contract verified** for upstream Coway IoCare `0.6.1`
at commit `e0f29953f650b09c8d994aafba5c27634e0bb705`, with archive SHA-256
`0a36be24d7294319880d1aa0cc6b6fcd9a66b8f2d08192bfd04b92c42204aaf5`.
The compatibility target is Home Assistant Core `2026.7.2`; the integration
manifest pins `cowayaio==0.2.4`.

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
