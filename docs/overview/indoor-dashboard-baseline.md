# Indoor Dashboard Architecture and Contract Baseline

Status: **IE-001 complete; AG-001 contract amendment complete**. This is the
controlling baseline for IE-002 through IE-014 and AG-001 through AG-009. The
pre-AirGradient IE-011 through IE-014 records describe the deployed schema-v3
system; the AG packages migrate that public contract to strict schema v4.
Later packages may fill verified capability options and private Home Assistant
mappings, but must not silently change the public names, safety rules,
thresholds, or package acceptance criteria recorded here.

## Scope and Fixed Platform Choices

Home Assistant is the sole indoor-device control authority. It runs as one
stateful application on the existing three-node k3s cluster. The custom Homepage
is a separate, stateless presentation and control gateway: its browser never
contacts Home Assistant, Prometheus, Google, Coway, or an ESPHome device directly.

The compatibility target for IE-002 and the production base for IE-003 is **Home
Assistant Core `2026.7.2`**. Patch upgrades require the IE-002 Coway harness and
Home Assistant configuration checks to pass before the production image changes.
The selected patch is listed in the official [Home Assistant 2026.7 release
notes](https://www.home-assistant.io/blog/2026/07/01/release-20267/#patch-releases).
IE-003 must pin the official image by digest as well as this human-readable
version; `latest`, floating calendar tags, and automatic in-cluster upgrades are
not allowed.

The Coway custom integration version is `0.6.1`. IE-002 owns resolving its full
upstream commit SHA and archive checksum, testing it unchanged, and documenting
the actual Airmega 250S contract. HACS is not part of this architecture.

```text
Aranet4 --BLE--> AtomS3 Lite --encrypted ESPHome API--> Home Assistant on k3s
Nest ------------------------ Google cloud -----------> Home Assistant on k3s
Airmega 250S units ---------- Coway IoCare+ cloud ----> Home Assistant on k3s
AirGradient ONE --local HTTP-------------------------> Home Assistant on k3s
                                                         |
                            allowlisted current state <--+
                            allowlisted controls ------->+
                                                         |
                   Prometheus <-- exact exporter set ----+
                         |                               |
                         +--> Homepage backend <---------+
                                  |
                                  schema-v4 REST/SSE and
                         reviewed action requests
                                  |
                    approved browser source paths only
```

Threshold automations notify but never operate equipment. Home Assistant remains
usable without Homepage, and Homepage is never a second device controller.
The AirGradient ONE target is firmware 3.1.1 or newer, uses the official Home
Assistant integration over local HTTP, resides on the IoT VLAN, and has cloud
sharing disabled. Home Assistant may take local configuration authority only
after the AG-002 owner gate is explicitly confirmed.

## Inventory, Rooms, and Ownership

Room display names are exactly `Living Room` and `Bedroom`; public room aliases
are exactly `living_room` and `bedroom`.

| Canonical device alias | Display name | Room | Connection to Home Assistant | Authority |
|---|---|---|---|---|
| `nest_living_room` | Living Room Nest | Living Room | Official Nest integration through Google Device Access | Home Assistant; cloud-dependent |
| `aranet_living_room` | Living Room Aranet4 | Living Room | Local BLE through the AtomS3 Lite ESPHome proxy | Home Assistant; local |
| `coway_living_room` | Living Room Coway | Living Room | Pinned IoCare integration through Coway IoCare+ | Home Assistant; cloud-dependent |
| `coway_bedroom` | Bedroom Coway | Bedroom | Pinned IoCare integration through Coway IoCare+ | Home Assistant; cloud-dependent |
| `airgradient_living_room` | Living Room AirGradient ONE | Living Room | Official Home Assistant AirGradient integration over local HTTP on the IoT VLAN | Home Assistant; local |

The AtomS3 Lite is infrastructure, not a fifth public indoor device. Its
canonical infrastructure alias is `atom_living_room`; it is assigned to Living
Room and exposes source health, not environmental readings of its own.

No serial number, MAC address, Bluetooth address, Google device ID, Coway device
ID, Home Assistant entity ID, or vendor-generated identifier is canonical. Such
values must not appear in Git, browser payloads, URLs, action bodies, fixtures,
or logs. During onboarding, the server-side adapter maps these aliases to Home
Assistant entities. That mapping remains private and emits only the aliases below.

### Canonical entity aliases

These strings are the complete public entity vocabulary. A later package may
mark an alias unsupported, but may not substitute a raw entity ID.

| Device | Read aliases | Control/state aliases |
|---|---|---|
| `aranet_living_room` | `aranet_living_room.temperature`, `.humidity`, `.pressure`, `.co2`, `.battery` | none |
| `nest_living_room` | `nest_living_room.current_temperature`, `.humidity` | `.hvac_mode`, `.heat_setpoint`, `.cool_setpoint`, `.fan_timer` |
| `coway_living_room` | `.aqi`, `.pm25`, `.pm10`, `.filter_life`, `.pre_filter_life`, `.hepa_filter_life` | `.power`, `.speed`, `.preset`, `.timer`, `.light`, `.button_lock`, `.sensitivity` |
| `coway_bedroom` | `.aqi`, `.pm25`, `.pm10`, `.filter_life`, `.pre_filter_life`, `.hepa_filter_life` | `.power`, `.speed`, `.preset`, `.timer`, `.light`, `.button_lock`, `.sensitivity` |
| `airgradient_living_room` | `.temperature`, `.humidity`, `.co2`, `.pm25`, `.pm10`, `.tvoc_index`, `.nox_index` | `.display_brightness`, `.led_brightness`, `.display_temperature_unit`, `.pm_standard`, `.led_mode` |

In the last two rows, every suffix is prefixed by that row's full device alias.
`pm25_worst` is a derived Living Room summary value, never a mapped Home Assistant
entity. It is the maximum current PM2.5 value among available Living Room sources;
it is `null` when no source is current and never reuses a stale value as current.

## Source and Cloud-Degradation Policy

Every value carries an observation time, freshness, severity, and normalized
source. The indoor contract uses only `CURRENT`, `STALE`, `NO_DATA`,
`NOT_SUPPORTED`, and `UNAVAILABLE`; `NOT_PROVISIONED` remains available in the
existing infrastructure contract but is invalid for an onboarded indoor device.
AirGradient is expected to be polled approximately once per minute. Its
freshness window is 180 seconds: an observation at age 0–180 seconds is
`CURRENT`, and a missing observation after that window is `STALE` or
`UNAVAILABLE` according to the source-health state. A stale value is retained
only as explicitly historical context.

- `CURRENT` is a successfully observed value within its source freshness window.
- `STALE` is a last known value displayed with its age. It cannot satisfy an
  action precondition and is never treated as a current alert input.
- `NO_DATA` means no successful value has been observed. No placeholder numeric
  value is permitted.
- `NOT_SUPPORTED` means onboarding proved that the hardware/account does not
  expose that alias or control. The UI must omit its control.
- `UNAVAILABLE` means an onboarded source is currently unreachable or the Home
  Assistant entity is unavailable. A last known value may be retained separately
  as stale history, but the current `value` is `null`.

The source availability roll-up is `AVAILABLE`, `DEGRADED`, or `UNAVAILABLE`.
One missing optional reading makes a device `DEGRADED`; loss of the device's
authoritative connection makes it `UNAVAILABLE`.

| Failure | Required behavior |
|---|---|
| Internet loss | Aranet readings continue locally. Nest and Coway become unavailable after their freshness windows. Only their controls are disabled. |
| Internet loss with AirGradient local path intact | AirGradient readings and approved local controls continue; cloud sharing is disabled and no cloud path is required. |
| Atom or ESPHome path loss | Aranet becomes unavailable/stale; Nest and both Coways continue independently. |
| AirGradient device or Home Assistant local-HTTP path loss | AirGradient readings and controls become unavailable after the 180-second freshness window; Nest, Aranet, and Coways continue independently. |
| Google/Nest failure | Nest readings and controls become unavailable; Aranet and Coways continue. No cached thermostat state is presented as current. |
| Coway account/API failure | Only affected Coway devices and controls become unavailable; Nest and Aranet continue. An account-wide failure may affect both Coways without affecting other sources. |
| One Coway device failure | The other purifier remains independently readable and controllable. |
| Home Assistant failure | All indoor current reads and controls are unavailable. Prometheus history may remain visible and explicitly historical. |
| Prometheus failure | Current Home Assistant state and eligible controls remain available; graphs show `NO DATA`/`STALE`. |
| Homepage failure | Home Assistant continues all integrations and notifications; no device state changes occur. |

Unavailable or partial data never lowers an existing alert, creates a zero, or
causes automatic device control. Recovery requires a new successful observation.

## Alert Contract

Durations below are continuous. A warning incident sends one warning, at most one
critical escalation, and one recovery. Repeated samples in the same state do not
notify. A critical incident de-escalates silently to warning and recovers only at
the recovery condition. Missing data pauses numeric threshold evaluation and is
handled by the separate source-unavailable incident.

| Signal | Warning | Critical | Recovery |
|---|---|---|---|
| Living Room CO2 (AirGradient primary, Aranet fallback) | `>= 1000 ppm` for 10m | `>= 1500 ppm` for 5m | `< 900 ppm` for 10m |
| Living Room temperature | `< 60°F` or `> 80°F` for 15m | `< 55°F` or `> 85°F` for 10m | `62–78°F` inclusive for 15m |
| Living Room humidity (AirGradient primary, Aranet fallback) | `< 30%` or `> 60%` for 30m | `< 20%` or `> 70%` for 15m | `32–58%` inclusive for 30m |
| Living Room worst-current PM2.5 (AirGradient or Living Room Coway) | `>= 15 µg/m³` for 15m | `>= 35 µg/m³` for 10m | `< 10 µg/m³` for 15m |
| Aranet battery | `<= 20%` for 30m | `<= 10%` for 15m | `>= 25%` for 30m |
| Coway filter life, per unit | `<= 10%` for 1h | `<= 2%` for 1h | `>= 15%` for 1h after replacement |
| Source unavailable, per device | unavailable for 5m | unavailable for 30m | current for 5m |
| HA automatic backup | last run failed, once per failed run | no successful encrypted local backup for 36h | next successful encrypted local backup |
| PBS backup copy | last copy failed, once per failed run | no successful PBS copy for 36h | next successful PBS copy |

Temperature comparisons use the normalized Fahrenheit value; Celsius-native
source values are converted before comparison. If Coway exposes a binary filter
replacement signal instead of percentage life, `on` for 15m is warning and `off`
for 15m is recovery; that entity cannot generate the percentage-based critical
state. Unsupported battery/filter entities produce no fabricated alert.

AirGradient TVOC and NOx indexes are informational readings only and have no
warning, critical, or recovery automation. CO2 and humidity evaluate the current
AirGradient reading first and use current Aranet only when AirGradient is not
current. Living Room PM2.5 evaluates the maximum of current AirGradient and
current Living Room Coway values; a stale high value is excluded, and numeric
evaluation pauses when neither source is current. Bedroom Coway PM2.5 remains a
separate incident.

Notifications use the Home Assistant Companion App. Their only mobile action
opens `/indoor`; notification actions cannot call a service or operate a device.

## Bootstrap Schema v4 Draft

Schema v4 is a deliberate breaking boundary for the indoor contract. A schema-v3
client must reject a v4 response before reading any fields; a v4 client must
reject a v3 response. Existing non-indoor bootstrap fields retain their prior
meaning only inside their matching schema version. The `indoor` member is
required in v4. Every object is strict: unknown fields, aliases, source values,
commands, and capability members are rejected. ISO timestamps include an
offset; state versions and action IDs are opaque server-generated strings.

The following TypeScript is the normative shape. It is a design contract for
AG-006, not runtime code added by AG-001.

```ts
type IndoorRoomAlias = "living_room" | "bedroom";
type IndoorDeviceAlias =
  | "nest_living_room"
  | "aranet_living_room"
  | "coway_living_room"
  | "coway_bedroom"
  | "airgradient_living_room";
type PurifierAlias = "coway_living_room" | "coway_bedroom";
type IndoorEntityAlias =
  | "aranet_living_room.temperature"
  | "aranet_living_room.humidity"
  | "aranet_living_room.pressure"
  | "aranet_living_room.co2"
  | "aranet_living_room.battery"
  | "airgradient_living_room.temperature"
  | "airgradient_living_room.humidity"
  | "airgradient_living_room.co2"
  | "airgradient_living_room.pm25"
  | "airgradient_living_room.pm10"
  | "airgradient_living_room.tvoc_index"
  | "airgradient_living_room.nox_index"
  | "nest_living_room.current_temperature"
  | "nest_living_room.humidity"
  | "nest_living_room.hvac_mode"
  | "nest_living_room.heat_setpoint"
  | "nest_living_room.cool_setpoint"
  | "nest_living_room.fan_timer"
  | "coway_living_room.aqi"
  | "coway_living_room.pm25"
  | "coway_living_room.pm10"
  | "coway_living_room.filter_life"
  | "coway_living_room.pre_filter_life"
  | "coway_living_room.hepa_filter_life"
  | "coway_living_room.power"
  | "coway_living_room.speed"
  | "coway_living_room.preset"
  | "coway_living_room.timer"
  | "coway_living_room.light"
  | "coway_living_room.button_lock"
  | "coway_living_room.sensitivity"
  | "coway_bedroom.aqi"
  | "coway_bedroom.pm25"
  | "coway_bedroom.pm10"
  | "coway_bedroom.filter_life"
  | "coway_bedroom.pre_filter_life"
  | "coway_bedroom.hepa_filter_life"
  | "coway_bedroom.power"
  | "coway_bedroom.speed"
  | "coway_bedroom.preset"
  | "coway_bedroom.timer"
  | "coway_bedroom.light"
  | "coway_bedroom.button_lock"
  | "coway_bedroom.sensitivity";
type IndoorControlAlias =
  | "airgradient_living_room.display_brightness"
  | "airgradient_living_room.led_brightness"
  | "airgradient_living_room.display_temperature_unit"
  | "airgradient_living_room.pm_standard"
  | "airgradient_living_room.led_mode";
type IndoorSource =
  | "ARANET_LOCAL"
  | "NEST_CLOUD"
  | "COWAY_CLOUD"
  | "AIRGRADIENT_LOCAL";
type IndoorFreshness =
  | "CURRENT"
  | "STALE"
  | "NO_DATA"
  | "NOT_SUPPORTED"
  | "UNAVAILABLE";
type IndoorSourceState = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
type ControlDependency =
  | "LOCAL"
  | "NEST_CLOUD"
  | "COWAY_CLOUD"
  | "AIRGRADIENT_LOCAL";
type IndoorUnit = "°F" | "%" | "hPa" | "ppm" | "µg/m³" | "index";
type HistoryWindow = "5m" | "15m" | "1h" | "3h" | "6h" | "24h" | "7d" | "30d" | "custom";
type IndoorHistoryWindow = "1h" | "3h" | "6h" | "24h" | "7d" | "30d" | "custom";

interface IndoorMetadata {
  source: IndoorSource;
  observedAt: string;
  freshness: IndoorFreshness;
  sourceState: IndoorSourceState;
  severity: "OK" | "INFO" | "WARN" | "CRIT";
  ageSeconds?: number;
  message?: string; // redacted, at most 240 characters
}

interface IndoorReading {
  alias: IndoorEntityAlias;
  value: number | null;
  unit: IndoorUnit;
  metadata: IndoorMetadata;
}

interface IndoorOptionCapability {
  supported: boolean;
  options: string[]; // normalized server slugs, never HA/vendor identifiers
  dependency: ControlDependency;
}

interface IndoorNumberCapability {
  supported: boolean;
  values: number[]; // exact advertised allowlist; empty when unsupported
  dependency: ControlDependency;
}

interface IndoorRangeCapability {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  dependency: "AIRGRADIENT_LOCAL";
}

interface AranetState {
  alias: "aranet_living_room";
  room: "living_room";
  sourceState: IndoorSourceState;
  readings: {
    temperature: IndoorReading;
    humidity: IndoorReading;
    pressure: IndoorReading;
    co2: IndoorReading;
    battery: IndoorReading;
  };
}

interface AirGradientCapabilities {
  displayBrightness: IndoorRangeCapability; // integer 0–100, step 1
  ledBrightness: IndoorRangeCapability; // integer 0–100, step 1
  displayTemperatureUnits: IndoorOptionCapability;
  pmStandards: IndoorOptionCapability;
  ledModes: IndoorOptionCapability;
}

interface AirGradientState {
  alias: "airgradient_living_room";
  room: "living_room";
  stateVersion: string;
  sourceState: IndoorSourceState;
  dependency: "AIRGRADIENT_LOCAL";
  readings: {
    temperature: IndoorReading;
    humidity: IndoorReading;
    co2: IndoorReading;
    pm25: IndoorReading;
    pm10: IndoorReading;
    tvocIndex: IndoorReading;
    noxIndex: IndoorReading;
  };
  capabilities: AirGradientCapabilities;
}

interface ThermostatCapabilities {
  hvacModes: IndoorOptionCapability;
  setpointShapes: ("HEAT" | "COOL" | "RANGE")[];
  setpointMinF: number | null;
  setpointMaxF: number | null;
  setpointStepF: number | null;
  fanTimerMinutes: IndoorNumberCapability;
}

interface ThermostatState {
  alias: "nest_living_room";
  room: "living_room";
  stateVersion: string;
  sourceState: IndoorSourceState;
  dependency: "NEST_CLOUD";
  currentTemperature: IndoorReading;
  humidity: IndoorReading;
  hvacMode: "OFF" | "HEAT" | "COOL" | "HEAT_COOL" | null;
  heatSetpointF: number | null;
  coolSetpointF: number | null;
  fanTimerEndsAt: string | null;
  capabilities: ThermostatCapabilities;
}

interface PurifierCapabilities {
  power: { supported: boolean; dependency: "COWAY_CLOUD" };
  speeds: IndoorNumberCapability; // live contract may contain only 1, 2, 3
  presets: IndoorOptionCapability;
  timerMinutes: IndoorNumberCapability;
  lightOptions: IndoorOptionCapability;
  buttonLock: { supported: boolean; dependency: "COWAY_CLOUD" };
  sensitivityOptions: IndoorOptionCapability;
}

interface PurifierState {
  alias: PurifierAlias;
  room: IndoorRoomAlias;
  stateVersion: string;
  sourceState: IndoorSourceState;
  dependency: "COWAY_CLOUD";
  power: boolean | null;
  speed: 1 | 2 | 3 | null;
  preset: string | null;
  timerEndsAt: string | null;
  light: string | null;
  buttonLock: boolean | null;
  sensitivity: string | null;
  readings: {
    aqi: IndoorReading;
    pm25: IndoorReading;
    pm10: IndoorReading;
    filterLife: IndoorReading;
    preFilterLife: IndoorReading;
    hepaFilterLife: IndoorReading;
  };
  capabilities: PurifierCapabilities;
}

interface IndoorRoomSummary {
  alias: IndoorRoomAlias;
  name: "Living Room" | "Bedroom";
  temperatureF: number | null;
  humidityPercent: number | null;
  co2Ppm: number | null;
  pm25WorstMicrogramsM3: number | null;
  activeAlertCount: number;
  freshness: IndoorFreshness;
}

interface IndoorAlert {
  id: string;
  room: IndoorRoomAlias;
  device: IndoorDeviceAlias | null;
  kind:
    | "CO2"
    | "TEMPERATURE"
    | "HUMIDITY"
    | "PM25"
    | "BATTERY"
    | "FILTER"
    | "SOURCE_UNAVAILABLE"
    | "BACKUP";
  severity: "WARN" | "CRIT";
  summary: string;
  startedAt: string;
}

interface IndoorActionStatus {
  actionId: string;
  target: "nest_living_room" | PurifierAlias | "airgradient_living_room";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  acceptedAt: string;
  resolvedAt: string | null;
  message?: string; // redacted
}

interface IndoorStateV4 {
  rooms: IndoorRoomSummary[];
  sensors: [AranetState, AirGradientState];
  thermostats: [ThermostatState];
  purifiers: [PurifierState, PurifierState];
  alerts: IndoorAlert[];
  actions: IndoorActionStatus[]; // pending and bounded recent results only
}

interface BootstrapV4 extends Omit<BootstrapV2, "schemaVersion"> {
  schemaVersion: 4;
  indoor: IndoorStateV4;
}
```

The indoor history endpoint continues to be `GET /api/v1/history`, accepts only
these AirGradient metric aliases in addition to the existing Git-owned aliases:

```text
airgradient_living_room.temperature
airgradient_living_room.humidity
airgradient_living_room.co2
airgradient_living_room.pm25
airgradient_living_room.pm10
airgradient_living_room.tvoc_index
airgradient_living_room.nox_index
```

It accepts fixed `1h`, `3h`, `6h`, `24h`, `7d`, or `30d`
windows. A `custom` request additionally requires validated ISO `start` and
`end` timestamps. Its Prometheus step is calculated server-side to bound the
response to 360 samples regardless of the retained range. Browser-supplied
PromQL, Home Assistant entity IDs, vendor IDs, URLs, and arbitrary metric names
are rejected. Existing non-indoor `5m` and `15m` history remains compatible.

Fixed and relative indoor ranges refresh on the shared 30-second Home Assistant
Prometheus scrape cadence. Polling pauses while the page is hidden and resumes
immediately when it becomes visible. Exact historical start/end ranges remain
static. A failed refresh retains the last successful series and displays its
successful update time with a degraded indicator instead of replacing the graph
with an empty state.

## Allowlisted Control Command Shapes

`POST /api/v1/indoor/actions` accepts exactly one strict envelope and one member
of the discriminated union below. The target alias is deliberately repeated in
each command so validation can bind the expected state version and capabilities
to one resource.

```ts
interface IndoorActionRequest {
  idempotencyKey: string;       // caller UUID, unique for at least 24h
  expectedStateVersion: string; // exact current target stateVersion
  confirmed: true;              // literal true; omission/false is rejected
  command: IndoorCommand;
}

type NestSetpoint =
  | { shape: "HEAT"; temperatureF: number }
  | { shape: "COOL"; temperatureF: number }
  | { shape: "RANGE"; heatTemperatureF: number; coolTemperatureF: number };

type IndoorCommand =
  | {
      type: "NEST_SET_HVAC_MODE";
      target: "nest_living_room";
      mode: "OFF" | "HEAT" | "COOL" | "HEAT_COOL";
    }
  | {
      type: "NEST_SET_SETPOINT";
      target: "nest_living_room";
      setpoint: NestSetpoint;
    }
  | {
      type: "NEST_SET_FAN_TIMER";
      target: "nest_living_room";
      durationMinutes: number;
    }
  | {
      type: "COWAY_SET_POWER";
      target: PurifierAlias;
      power: boolean;
    }
  | {
      type: "COWAY_SET_PRESET";
      target: PurifierAlias;
      preset: string;
    }
  | {
      type: "COWAY_SET_SPEED";
      target: PurifierAlias;
      speed: 1 | 2 | 3;
    }
  | {
      type: "COWAY_SET_TIMER";
      target: PurifierAlias;
      durationMinutes: number;
    }
  | {
      type: "COWAY_SET_LIGHT";
      target: PurifierAlias;
      light: string;
    }
  | {
      type: "COWAY_SET_BUTTON_LOCK";
      target: PurifierAlias;
      locked: boolean;
    }
  | {
      type: "COWAY_SET_SENSITIVITY";
      target: PurifierAlias;
      sensitivity: string;
    }
  | {
      type: "AIRGRADIENT_SET_DISPLAY_BRIGHTNESS";
      target: "airgradient_living_room";
      brightness: number; // integer 0–100, step 1
    }
  | {
      type: "AIRGRADIENT_SET_LED_BRIGHTNESS";
      target: "airgradient_living_room";
      brightness: number; // integer 0–100, step 1
    }
  | {
      type: "AIRGRADIENT_SET_DISPLAY_TEMPERATURE_UNIT";
      target: "airgradient_living_room";
      unit: string; // exact current advertised option
    }
  | {
      type: "AIRGRADIENT_SET_PM_STANDARD";
      target: "airgradient_living_room";
      standard: string; // exact current advertised option
    }
  | {
      type: "AIRGRADIENT_SET_LED_MODE";
      target: "airgradient_living_room";
      mode: string; // exact current advertised option
    };

interface IndoorActionAccepted {
  actionId: string;
  target: "nest_living_room" | PurifierAlias | "airgradient_living_room";
  status: "PENDING";
  acceptedAt: string;
}

interface IndoorActionAcceptedResponse {
  data: IndoorActionAccepted;
  requestId: string;
}
```

String and numeric command values are not open-ended despite their JSON scalar
types. Nest mode/setpoint shape, fan duration, setpoint range and step must match
the current thermostat capabilities. Coway preset, timer, light, and sensitivity
must exactly match the target purifier's current advertised option/value arrays.
AirGradient brightness must be an integer from 0 through 100 at step 1, and its
temperature-unit, PM-standard, and LED-mode strings must exactly match the
target's current advertised option arrays. AG-002 supplies the redacted
AirGradient capability evidence; empty or unsupported capability arrays reject
the action. The gateway cannot forward a caller-provided Home Assistant service,
entity, or value.

Successful validation returns HTTP `202` and `IndoorActionAccepted`. It does not
change the bootstrap state optimistically. The result stays `PENDING` until a new
Home Assistant observation converges on the requested state. Non-convergence is
`TIMED_OUT`; a source/API failure is `FAILED`. A retry with the same idempotency
key returns the original action and never repeats the Home Assistant call.

## Control and Network Safeguards

All of the following gates are mandatory and fail closed:

1. The request reaches the private production or preview ingress through either
   the approved MacBook's stable identity on Main/Trusted `192.168.20.0/24`, or
   the existing Teleport VPN `192.168.2.0/24`. Other LAN, IoT, Services, Servers,
   Management, Internet, and untrusted forwarded-source paths cannot use the
   action endpoint. Read-only Homepage behavior remains separately compatible.
2. The trusted ingress supplies the source identity; the backend ignores
   caller-forged forwarding headers. UniFi and ingress policy remain the primary
   source-path enforcement layers.
3. `Origin` exactly matches the serving Homepage origin,
   `Sec-Fetch-Site: same-origin`, and a compatible Fetch Metadata mode is present.
   Missing/cross-origin metadata, non-JSON bodies, and cross-site requests fail.
4. `confirmed` is literal `true`; `expectedStateVersion` matches the current
   target; the source is current and available; and the command is advertised by
   that target's current capabilities.
5. Idempotency keys are retained at least 24 hours. The application rate limit is
   10 requests per source identity per minute, including rejected requests, plus
   two pending actions per target and one action execution at a time per target.
   Rejected requests do not invoke HA.
6. The gateway maps the discriminated command to a fixed server-owned Home
   Assistant call. Raw entity IDs, service names, URLs, vendor identifiers,
   templates, and arbitrary JSON service data are rejected by strict schemas.
7. A redacted audit event records action ID, canonical target alias, command type,
   old normalized state, requested normalized state, latency, and result. It never
   records credentials, raw HA IDs, vendor IDs, headers, tokens, or upstream bodies.

There is no automatic equipment-control automation, bulk command, arbitrary
service proxy, notification action that controls a device, or browser-to-Home
Assistant credential. Rollback or cloud failure cannot replay an accepted action.

## AirGradient acceptance and rollback contract

AG-001 is accepted only when the following fixed contract is documented without
private identifiers or unverified capability values:

- the Living Room inventory row, canonical aliases, `AIRGRADIENT_LOCAL` source,
  local-HTTP boundary, firmware 3.1.1 minimum, disabled cloud sharing, and
  180-second freshness window;
- strict schema v4 with explicit v3 rejection, seven read aliases, five control
  aliases, numeric brightness range 0–100 step 1, and runtime-advertised option
  capabilities;
- Nest temperature authority, AirGradient CO2/humidity authority with current
  Aranet fallback, worst-current Living Room PM2.5, independent Bedroom Coway
  alerts, and informational-only TVOC/NOx;
- fixed action commands with expected-state version, confirmation, idempotency,
  convergence, rate limits, and redacted audits; and
- package dependencies, owner gate, deterministic/live acceptance matrix, and
  Git-only rollback sequence.

No AG-001 acceptance item claims that the physical ONE is onboarded. The only
live evidence allowed before AG-002 is `fixture only` or redacted documentation
of the owner gate. AG-002 must record actual capabilities; its evidence may mark
an advertised option unsupported, but may not add a new public alias or command.

The AirGradient migration rollback is a versioned Git operation. Before AG-009,
revert the active package commit and leave the existing pre-AirGradient
schema-v3 deployment unchanged. During AG-009, revert the digest-pinned v4
manifests and application configuration through Git/Argo CD, wait for the prior
image to report healthy, verify that no mixed v3/v4 pods remain, and confirm
Home Assistant's official integration remains usable. Rollback never sends a
device-setting reversal and never deletes the reserved address, local
integration, or retained history. Forward recovery reapplies the validated v4
revision only after the complete live acceptance matrix passes again.

## Rollout Sequence and Package Status

`BLOCKED` means blocked by the listed package or owner gate, not that the package
has been attempted and failed.

| Package | Status at AG-001 amendment | Dependency / gate | Fixed acceptance outcome |
|---|---|---|---|
| IE-001 Architecture and contract baseline | **COMPLETE** | none | This document is internally consistent, credential-free, and fixes names, contracts, thresholds, safeguards, sequence, and acceptance rules. |
| IE-002 Coway compatibility harness | **COMPLETE** | IE-001 | `0.6.1` is SHA/checksum-pinned; unchanged upstream imports and passes config-flow/entity tests on HA `2026.7.2`; exact 250S entities/services are recorded. |
| IE-003 Production HA image | **COMPLETE** | IE-002 | Digest-pinned official base contains verified Coway source; CI checks HA config/import/tests/build, emits SBOM/provenance and scan results, and publishes immutable SHA tags to GHCR. |
| IE-004 HA k3s foundation | **LIVE; PRIOR-IMAGE PROOF PENDING** | IE-003 | Argo is Synced/Healthy; private onboarding works; the 10 GiB writable state survives replacement; prior-image rollback is proven; only initial ingress/DNS/external-HTTPS paths exist. |
| IE-005 AtomS3 Lite proxy | **COMPLETE** | IE-004 plus owner USB flash/secrets gate | Exact Kubernetes and UniFi paths, node/unrelated-host tests, protected OTA, encrypted HA integration, and physical power-cycle reconnection pass. |
| IE-006 Aranet4 | **COMPLETE** | IE-005 complete; owner gate complete | Firmware 2.0.15, official local integration, five readings, Internet-loss continuity, and Atom-loss/recovery are verified without fabricated current values. |
| IE-007 Nest | **LIVE; STALE-STATE GUARD PENDING** | IE-004; owner OAuth/Device Access gate complete | Reads/controls pass and verified Internet loss stops observations; raw HA retains cached values, so unavailable/null and stale-command rejection remain. |
| IE-008 Coway live onboarding | **LIVE; STALE-STATE GUARD PENDING** | IE-002 and IE-004; owner credential gate complete | Both units pass all reads/controls and verified cloud loss/recovery; raw HA retains cached values, so unavailable/null and stale-command rejection remain. |
| IE-009 Alerts and mobile notifications | **COMPLETE** | IE-006 complete; IE-007/IE-008 stale evidence incorporated | Git-owned packages and deterministic incidents produce exactly one warning, escalation, and recovery; the runtime-only Companion App target delivered the live acceptance notification with an `/indoor`-only action; no automation controls equipment. |
| IE-010 Prometheus history | **COMPLETE** | IE-006, IE-007, IE-008 complete | Dedicated non-admin authenticated scrape exports exactly 15 normalized indoor readings; all four history windows pass, private mappings survive restart, and controlled unavailable state removes only the current series while retaining truthful history. |
| IE-011 Homepage read contract | **COMPLETE** | IE-001, IE-006, IE-007, IE-008, IE-010 | Schema v3, fixed-alias HA adapter, four indoor history windows, redaction, and all five fixtures pass; the scanned immutable image is Synced/Healthy and live partial-source behavior nulls stale cloud values without affecting local Aranet or retained history. |
| IE-012 Homepage control gateway | **COMPLETE** | IE-011 complete | The fixed endpoint, private runtime mappings, persistent 24-hour replay journal, convergence tracking, rate/concurrency limits, and source/origin/state/capability safeguards pass 103 tests; the immutable image is live and correctly rejects currently degraded cloud sources without issuing device calls. |
| IE-013 Indoor dashboard UI | COMPLETE | IE-011 and IE-012 complete | Overview, `/indoor`, four graph windows, capability rendering, review dialogs, truthful pending/failure states, accessibility, responsive, keyboard, and Playwright tests pass. |
| IE-014 Backup, restore, rollout | COMPLETE | IE-004, IE-009, IE-013 complete | Seven encrypted local archives and least-privilege PBS copies operate; the clean-PVC restore and failure matrix pass; production and rollback are GitOps-proven. |
| AG-001 Contract baseline | **COMPLETE** | AG-000 documentation publication | AirGradient inventory, aliases, source/freshness policy, strict schema-v4 design, alert authority, five-command allowlist, acceptance matrix, and rollback contract are fixed here; no runtime code changed. |
| AG-002 Network and HA onboarding | **COMPLETE** | AG-001 plus owner gate | Firmware 3.6.2, reserved IoT address, least-privilege local HTTP, official integration, local configuration authority, cloud sharing off, and redacted capability evidence pass. |
| AG-003 HA normalization | **COMPLETE** | AG-002 | Seven private mappings, eight canonical entities, Fahrenheit normalization, 180-second freshness, source rollup, restart recovery, manifest/contract tests, and redacted live verification pass. |
| AG-004 Alert migration | **COMPLETE** | AG-003 | AirGradient CO2/humidity authority, current-source fallback, worst-current Living Room PM2.5, source-loss incidents, deduplication, hysteresis, deterministic synthetic tests, restart recovery, and live rollups pass. |
| AG-005 Prometheus history | **COMPLETE** | AG-003 | Seven exact AirGradient aliases and live metric names are allowlisted for every supported window; 132 tests, manifest contracts, arbitrary-identifier rejection, and redaction pass. |
| AG-006 Schema-v4 read path | **COMPLETE** | AG-003 and AG-005 | Strict v4 rejects v3 clients, unknown fields, missing AirGradient state, and arbitrary aliases; seven readings, fixed/closed capabilities, precedence, freshness, history, fixtures, adapter/API tests, TypeScript builds, and 133 tests pass. |
| AG-007 Control gateway | **COMPLETE** | AG-002 and AG-006 | Five fixed commands enforce numeric/option capabilities, review, confirmation, expected state version, idempotency, convergence, persistence, rate/concurrency limits, unavailable/capability/origin/network rejection, separate write-token authority, and redacted audits; 140 tests pass. |
| AG-008 Dashboard UI | **COMPLETE** | AG-006 and AG-007 | AirGradient + Nest and compact Aranet cards, six ordered graphs, capability omission, review dialogs, truthful partial state, accessibility, responsive, 141 unit tests, and 17 E2E tests pass. |
| AG-009 Production rollout | **COMPLETE** | AG-004 and AG-008 | Outage/control matrix, image scans, digest pin, Argo health, live readings/history/settings, firewall isolation, and Git-only rollback/forward recovery pass; IE-015 evidence is complete. |

The IE-011 through IE-014 rows above are historical evidence for the deployed
pre-AirGradient schema-v3 dashboard and remain valid for that release. AG-006
is the controlled v4 migration; no mixed-version rollout is accepted. AG-009
must supersede the v3 image and update the historical closeout references only
after v4 live acceptance passes.

IE-006, IE-007, and IE-008 may proceed independently only after their own
prerequisites. IE-009 and IE-010 may proceed in parallel only after all device
contracts are stable. IE-011 through IE-014 are sequential because they modify
shared public contracts, controls, UI, and production state. No package may
silently absorb another package's implementation.

For the AirGradient migration, AG-002 waits for the AG-001 baseline and the
owner-operated device gate. AG-003 follows onboarding. AG-004 and AG-005 may
run in parallel after AG-003. AG-006 follows both read normalization and
history. AG-007 follows the v4 read path and onboarding; AG-008 follows the
read path and control gateway; AG-009 follows alert migration and UI. No AG
package may begin early or modify the pre-AirGradient deployment as a shortcut.

## Per-Package Handoff and Change Control

Each package is one independently reviewable change and owns its implementation,
tests, documentation, and rollback. Its handoff must record:

- package ID, prerequisites verified, and acceptance criteria result;
- every changed file;
- exact commands/tests run and their result;
- redacted live evidence, or `fixture only` when no live gate was authorized;
- unresolved observations and explicit owner-operated gates;
- rollback steps and the last known safe image/revision where applicable; and
- the next packages unblocked by acceptance.

IE-005, IE-007, and IE-008 stop before their owner-operated gates, provide exact
instructions, and resume only after owner confirmation. Secrets are entered into
the destination system by the owner and are never copied into a handoff.

A contract change after IE-001 requires an explicit baseline amendment describing
the reason, affected packages, migration/compatibility behavior, tests, and
rollback. Discovery that a capability is unsupported normally changes only that
device's advertised capabilities; it does not justify a new public alias or an
arbitrary action shape.
