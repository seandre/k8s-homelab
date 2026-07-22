# Indoor Dashboard Architecture and Contract Baseline

Status: **IE-001 complete**. This is the controlling baseline for IE-002 through
IE-014. Later packages may fill verified capability options and server-side Home
Assistant mappings, but must not silently change the public names, safety rules,
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
                                                         |
                            allowlisted current state <--+
                            allowlisted controls ------->+
                                                         |
                   Prometheus <-- exact exporter set ----+
                         |                               |
                         +--> Homepage backend <---------+
                                  |
                         schema-v3 REST/SSE and
                         reviewed action requests
                                  |
                    approved browser source paths only
```

Threshold automations notify but never operate equipment. Home Assistant remains
usable without Homepage, and Homepage is never a second device controller.

## Inventory, Rooms, and Ownership

Room display names are exactly `Living Room` and `Bedroom`; public room aliases
are exactly `living_room` and `bedroom`.

| Canonical device alias | Display name | Room | Connection to Home Assistant | Authority |
|---|---|---|---|---|
| `nest_living_room` | Living Room Nest | Living Room | Official Nest integration through Google Device Access | Home Assistant; cloud-dependent |
| `aranet_living_room` | Living Room Aranet4 | Living Room | Local BLE through the AtomS3 Lite ESPHome proxy | Home Assistant; local |
| `coway_living_room` | Living Room Coway | Living Room | Pinned IoCare integration through Coway IoCare+ | Home Assistant; cloud-dependent |
| `coway_bedroom` | Bedroom Coway | Bedroom | Pinned IoCare integration through Coway IoCare+ | Home Assistant; cloud-dependent |

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
| `coway_living_room` | `.aqi`, `.pm25`, `.pm10`, `.filter_life` | `.power`, `.speed`, `.preset`, `.timer`, `.light`, `.button_lock`, `.sensitivity` |
| `coway_bedroom` | `.aqi`, `.pm25`, `.pm10`, `.filter_life` | `.power`, `.speed`, `.preset`, `.timer`, `.light`, `.button_lock`, `.sensitivity` |

In the last two rows, every suffix is prefixed by that row's full device alias.
`pm25_worst` is a derived Living Room summary value, never a mapped Home Assistant
entity. It is the maximum current PM2.5 value among available Living Room sources;
it is `null` when no source is current and never reuses a stale value as current.

## Source and Cloud-Degradation Policy

Every value carries an observation time, freshness, severity, and normalized
source. The indoor contract uses only `CURRENT`, `STALE`, `NO_DATA`,
`NOT_SUPPORTED`, and `UNAVAILABLE`; `NOT_PROVISIONED` remains available in the
existing infrastructure contract but is invalid for an onboarded indoor device.

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
| Atom or ESPHome path loss | Aranet becomes unavailable/stale; Nest and both Coways continue independently. |
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
| Living Room CO2 | `>= 1000 ppm` for 10m | `>= 1500 ppm` for 5m | `< 900 ppm` for 10m |
| Living Room temperature | `< 60°F` or `> 80°F` for 15m | `< 55°F` or `> 85°F` for 10m | `62–78°F` inclusive for 15m |
| Living Room humidity | `< 30%` or `> 60%` for 30m | `< 20%` or `> 70%` for 15m | `32–58%` inclusive for 30m |
| Either Coway PM2.5 | `>= 15 µg/m³` for 15m | `>= 35 µg/m³` for 10m | `< 10 µg/m³` for 15m |
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

Notifications use the Home Assistant Companion App. Their only mobile action
opens `/indoor`; notification actions cannot call a service or operate a device.

## Bootstrap Schema v3 Draft

Existing schema-v2 fields remain backward-compatible, except that
`schemaVersion` becomes literal `3`. Schema v3 adds the required `indoor` member.
All objects are strict: unknown fields are rejected. ISO timestamps include an
offset; state versions and action IDs are opaque server-generated strings.

The following TypeScript is the normative shape. It is a design contract for
IE-011, not runtime code added by IE-001.

```ts
type IndoorRoomAlias = "living_room" | "bedroom";
type IndoorDeviceAlias =
  | "nest_living_room"
  | "aranet_living_room"
  | "coway_living_room"
  | "coway_bedroom";
type PurifierAlias = "coway_living_room" | "coway_bedroom";
type IndoorEntityAlias =
  | "aranet_living_room.temperature"
  | "aranet_living_room.humidity"
  | "aranet_living_room.pressure"
  | "aranet_living_room.co2"
  | "aranet_living_room.battery"
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
  | "coway_bedroom.power"
  | "coway_bedroom.speed"
  | "coway_bedroom.preset"
  | "coway_bedroom.timer"
  | "coway_bedroom.light"
  | "coway_bedroom.button_lock"
  | "coway_bedroom.sensitivity";
type IndoorSource = "ARANET_LOCAL" | "NEST_CLOUD" | "COWAY_CLOUD";
type IndoorFreshness =
  | "CURRENT"
  | "STALE"
  | "NO_DATA"
  | "NOT_SUPPORTED"
  | "UNAVAILABLE";
type IndoorSourceState = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
type ControlDependency = "LOCAL" | "NEST_CLOUD" | "COWAY_CLOUD";
type IndoorUnit = "°F" | "%" | "hPa" | "ppm" | "µg/m³";
type HistoryWindow = "5m" | "15m" | "1h" | "24h" | "7d" | "30d";
type IndoorHistoryWindow = "1h" | "24h" | "7d" | "30d";

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
  target: "nest_living_room" | PurifierAlias;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  acceptedAt: string;
  resolvedAt: string | null;
  message?: string; // redacted
}

interface IndoorStateV3 {
  rooms: IndoorRoomSummary[];
  sensors: [AranetState];
  thermostats: [ThermostatState];
  purifiers: [PurifierState, PurifierState];
  alerts: IndoorAlert[];
  actions: IndoorActionStatus[]; // pending and bounded recent results only
}

interface BootstrapV3 extends Omit<BootstrapV2, "schemaVersion"> {
  schemaVersion: 3;
  indoor: IndoorStateV3;
}
```

The indoor history endpoint continues to be `GET /api/v1/history`, accepts only
Git-owned metric aliases and `1h`, `24h`, `7d`, or `30d`, and returns the existing
validated time-series envelope. Browser-supplied PromQL, Home Assistant entity
IDs, vendor IDs, URLs, and arbitrary metric names are rejected. Existing
non-indoor `5m` and `15m` history remains compatible.

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
    };

interface IndoorActionAccepted {
  actionId: string;
  target: "nest_living_room" | PurifierAlias;
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
IE-007 and IE-008 populate those arrays from verified live capabilities. Empty or
unsupported capability arrays reject the action; the gateway cannot forward a
caller-provided Home Assistant service or value.

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

## Rollout Sequence and Package Status

`BLOCKED` means blocked by the listed package or owner gate, not that the package
has been attempted and failed.

| Package | Status at IE-001 close | Dependency / gate | Fixed acceptance outcome |
|---|---|---|---|
| IE-001 Architecture and contract baseline | **COMPLETE** | none | This document is internally consistent, credential-free, and fixes names, contracts, thresholds, safeguards, sequence, and acceptance rules. |
| IE-002 Coway compatibility harness | **COMPLETE** | IE-001 | `0.6.1` is SHA/checksum-pinned; unchanged upstream imports and passes config-flow/entity tests on HA `2026.7.2`; exact 250S entities/services are recorded. |
| IE-003 Production HA image | **COMPLETE** | IE-002 | Digest-pinned official base contains verified Coway source; CI checks HA config/import/tests/build, emits SBOM/provenance and scan results, and publishes immutable SHA tags to GHCR. |
| IE-004 HA k3s foundation | **LIVE; PRIOR-IMAGE PROOF PENDING** | IE-003 | Argo is Synced/Healthy; private onboarding works; the 10 GiB writable state survives replacement; prior-image rollback is proven; only initial ingress/DNS/external-HTTPS paths exist. |
| IE-005 AtomS3 Lite proxy | **COMPLETE** | IE-004 plus owner USB flash/secrets gate | Exact Kubernetes and UniFi paths, node/unrelated-host tests, protected OTA, encrypted HA integration, and physical power-cycle reconnection pass. |
| IE-006 Aranet4 | **LIVE; FINAL ACCEPTANCE PENDING** | IE-005 complete; owner gate complete | Firmware 2.0.15, official local integration, five readings, and Atom-loss/recovery are verified; unchanged-value cadence and an effective Internet-loss test remain. |
| IE-007 Nest | **LIVE; CLOUD-LOSS ACCEPTANCE PENDING** | IE-004; owner OAuth/Device Access gate complete | Official readings, all four HVAC modes, three setpoint shapes/range/step, 12-hour fan start/cancel, naming, and restore pass; scoped cloud-loss behavior remains. |
| IE-008 Coway live onboarding | BLOCKED | IE-002 and IE-004 plus owner credential gate | Both units independently pass advertised read/control checks; unreliable/absent entities are disabled; redacted capability fixtures are recorded. |
| IE-009 Alerts and mobile notifications | BLOCKED | IE-006, IE-007, IE-008 | Git-owned packages produce exactly one warning, escalation, and recovery in synthetic incidents; mobile opens `/indoor`; no automation controls equipment. |
| IE-010 Prometheus history | BLOCKED | IE-006, IE-007, IE-008 | Dedicated non-admin authenticated scrape exports only the indoor allowlist; 1h/24h/7d/30d return truthful data; unavailable state leaves no misleading current series. |
| IE-011 Homepage read contract | BLOCKED | IE-001, IE-006, IE-007, IE-008, IE-010 | Schema v3, fixed-alias HA adapter, four indoor history windows, redaction, and healthy/partial/stale/unavailable/unsupported fixtures pass tests. |
| IE-012 Homepage control gateway | BLOCKED | IE-011 | Success, convergence, timeout, cloud failure, stale/replay/capability/origin/network rejection, rate limit, and redacted audit tests pass for the fixed endpoint. |
| IE-013 Indoor dashboard UI | BLOCKED | IE-011 and IE-012 | Overview, `/indoor`, four graph windows, capability rendering, review dialogs, truthful pending/failure states, accessibility, responsive, keyboard, and Playwright tests pass. |
| IE-014 Backup, restore, rollout | BLOCKED | IE-004, IE-009, IE-013 | Seven encrypted local archives and PBS copy policy operate; clean-PVC restore and failure matrix pass; preview soak is clean; production and rollback are GitOps-proven. |

IE-006, IE-007, and IE-008 may proceed independently only after their own
prerequisites. IE-009 and IE-010 may proceed in parallel only after all device
contracts are stable. IE-011 through IE-014 are sequential because they modify
shared public contracts, controls, UI, and production state. No package may
silently absorb another package's implementation.

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
