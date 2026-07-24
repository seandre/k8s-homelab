import { z } from 'zod';

export const SeveritySchema = z.enum(['OK', 'INFO', 'WARN', 'CRIT']);
export type Severity = z.infer<typeof SeveritySchema>;

export const FreshnessSchema = z.enum([
  'CURRENT',
  'STALE',
  'NO_DATA',
  'NOT_PROVISIONED',
  'NOT_SUPPORTED',
]);
export type Freshness = z.infer<typeof FreshnessSchema>;

export const SourceMetadataSchema = z.object({
  source: z.string().min(1),
  observedAt: z.string().datetime({ offset: true }),
  freshness: FreshnessSchema,
  severity: SeveritySchema,
  ageSeconds: z.number().nonnegative().optional(),
  message: z.string().max(240).optional(),
});
export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;

export const AlertSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  severity: SeveritySchema,
  summary: z.string().max(240),
  startsAt: z.string().datetime({ offset: true }),
  source: z.string().min(1),
  metadata: SourceMetadataSchema,
});
export type Alert = z.infer<typeof AlertSchema>;

export const TimeSeriesPointSchema = z.object({
  timestamp: z.string().datetime({ offset: true }),
  value: z.number().finite(),
});

export const TimeSeriesSchema = z.object({
  metric: z.string().min(1),
  unit: z.string().min(1),
  window: z.enum(['5m', '15m', '1h', '24h', '7d', '30d']),
  points: z.array(TimeSeriesPointSchema).max(360),
  metadata: SourceMetadataSchema,
});
export type TimeSeries = z.infer<typeof TimeSeriesSchema>;

export const HostSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['PROXMOX', 'K3S_NODE', 'OKD_NODE', 'VM']),
  cpuPercent: z.number().min(0).max(100).nullable(),
  memoryPercent: z.number().min(0).max(100).nullable(),
  memoryUsedBytes: z.number().nonnegative().nullable(),
  memoryTotalBytes: z.number().positive().nullable(),
  diskUsedBytes: z.number().nonnegative().nullable(),
  diskTotalBytes: z.number().positive().nullable(),
  diskIoPercent: z.number().min(0).max(100).nullable(),
  cpuModel: z.string().min(1).nullable(),
  cpuCorePercentages: z.array(z.number().min(0).max(100)).min(1).nullable(),
  loadAverage: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]).nullable(),
  cpuClockMhz: z.number().nonnegative().nullable(),
  powerWatts: z.number().nonnegative().nullable(),
  swapUsedBytes: z.number().nonnegative().nullable(),
  swapTotalBytes: z.number().positive().nullable(),
  uptimeSeconds: z.number().int().nonnegative().nullable(),
  runningVmCount: z.number().int().nonnegative().nullable(),
  stoppedVmCount: z.number().int().nonnegative().nullable(),
  runningContainerCount: z.number().int().nonnegative().nullable(),
  stoppedContainerCount: z.number().int().nonnegative().nullable(),
  temperatureCelsius: z.number().finite().nullable(),
  networkIngressBitsPerSecond: z.number().nonnegative().nullable(),
  networkEgressBitsPerSecond: z.number().nonnegative().nullable(),
  networkTotalBytes: z.number().nonnegative().nullable(),
  metadata: SourceMetadataSchema,
});
export type Host = z.infer<typeof HostSchema>;

export const ClusterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(['K3S', 'OKD']),
  nodeCount: z.number().int().nonnegative().nullable(),
  readyNodeCount: z.number().int().nonnegative().nullable(),
  workloadCount: z.number().int().nonnegative().nullable(),
  cpuCapacityCores: z.number().positive().nullable(),
  cpuUsedCores: z.number().nonnegative().nullable(),
  memoryCapacityBytes: z.number().positive().nullable(),
  memoryUsedBytes: z.number().nonnegative().nullable(),
  metadata: SourceMetadataSchema,
});
export type Cluster = z.infer<typeof ClusterSchema>;

export const WorkloadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  clusterId: z.string().min(1),
  namespace: z.string().min(1),
  readyReplicas: z.number().int().nonnegative().nullable(),
  desiredReplicas: z.number().int().nonnegative().nullable(),
  href: z.string().url().nullable(),
  metadata: SourceMetadataSchema,
});
export type Workload = z.infer<typeof WorkloadSchema>;

export const LatencyProtocolSchema = z.enum(['ICMP', 'TCP', 'HTTPS']);
export type LatencyProtocol = z.infer<typeof LatencyProtocolSchema>;

export const UniFiStateSchema = z.object({
  controller: z.string().min(1).nullable(),
  status: z.enum(['UP', 'DEGRADED', 'DOWN']).nullable(),
  metadata: SourceMetadataSchema,
});
export type UniFiState = z.infer<typeof UniFiStateSchema>;

export const SpeedTestResultSchema = z.object({
  downloadMbps: z.number().nonnegative().nullable(),
  uploadMbps: z.number().nonnegative().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  observedAt: z.string().datetime({ offset: true }).nullable(),
  metadata: SourceMetadataSchema,
});
export type SpeedTestResult = z.infer<typeof SpeedTestResultSchema>;

export const PduPowerSchema = z.object({
  totalWatts: z.number().nonnegative().nullable(),
  metadata: SourceMetadataSchema,
});
export type PduPower = z.infer<typeof PduPowerSchema>;

export const UdmTelemetrySchema = z.object({
  wanDownloadMbps: z.number().nonnegative().nullable(),
  wanUploadMbps: z.number().nonnegative().nullable(),
  wanTotalBytes: z.number().nonnegative().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  cpuPercent: z.number().min(0).max(100).nullable(),
  memoryPercent: z.number().min(0).max(100).nullable(),
  temperatureCelsius: z.number().finite().nullable(),
  uptimeSeconds: z.number().nonnegative().nullable(),
  clientCount: z.number().int().nonnegative().nullable(),
  metadata: SourceMetadataSchema,
});
export type UdmTelemetry = z.infer<typeof UdmTelemetrySchema>;

export const NetworkSummarySchema = z.object({
  gatewayLatencyMs: z.number().nonnegative().nullable(),
  gatewayLatencyProtocol: LatencyProtocolSchema.nullable(),
  internetLatencyMs: z.number().nonnegative().nullable(),
  internetLatencyProtocol: LatencyProtocolSchema.nullable(),
  ingressVip: z.string().ip().nullable(),
  ingressVips: z.array(z.string().ip()).min(1),
  unifi: UniFiStateSchema,
  udm: UdmTelemetrySchema,
  pduPower: PduPowerSchema,
  lastSpeedTest: SpeedTestResultSchema,
  metadata: SourceMetadataSchema,
});
export type NetworkSummary = z.infer<typeof NetworkSummarySchema>;

export const PbsStatusSchema = z.object({
  datastore: z.string().min(1),
  reachable: z.boolean().nullable(),
  metadata: SourceMetadataSchema,
});
export type PbsStatus = z.infer<typeof PbsStatusSchema>;

export const StoragePolicySchema = z.object({
  backupWarningAgeSeconds: z.number().int().positive(),
  backupFailureThreshold: z.number().int().positive(),
});
export type StoragePolicy = z.infer<typeof StoragePolicySchema>;

export const StorageSummarySchema = z.object({
  pbs: PbsStatusSchema,
  policy: StoragePolicySchema,
});
export type StorageSummary = z.infer<typeof StorageSummarySchema>;

export const StorageBackupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capacityBytes: z.number().nonnegative().nullable(),
  usedBytes: z.number().nonnegative().nullable(),
  lastSuccessfulBackupAt: z.string().datetime({ offset: true }).nullable(),
  failureCount: z.number().int().nonnegative().nullable(),
  metadata: SourceMetadataSchema,
});
export type StorageBackup = z.infer<typeof StorageBackupSchema>;

export const ServiceStatusSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  group: z.string().min(1),
  description: z.string().min(1),
  href: z.string().url(),
  status: z.enum(['UP', 'DEGRADED', 'DOWN']),
  latencyMs: z.number().nonnegative().nullable(),
  metadata: SourceMetadataSchema,
});
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const WeatherSchema = z.object({
  location: z.string().min(1),
  temperatureFahrenheit: z.number().finite().nullable(),
  condition: z.string().min(1).nullable(),
  sunrise: z.string().datetime({ offset: true }).nullable(),
  sunset: z.string().datetime({ offset: true }).nullable(),
  usAqi: z.number().nonnegative().nullable(),
  pm25: z.number().nonnegative().nullable(),
  pm10: z.number().nonnegative().nullable(),
  conditionsMetadata: SourceMetadataSchema,
  airQualityMetadata: SourceMetadataSchema,
  metadata: SourceMetadataSchema,
});
export type Weather = z.infer<typeof WeatherSchema>;

export const IndoorRoomAliasSchema = z.enum(['living_room', 'bedroom']);
export const IndoorDeviceAliasSchema = z.enum(['nest_living_room', 'aranet_living_room', 'coway_living_room', 'coway_bedroom']);
export const PurifierAliasSchema = z.enum(['coway_living_room', 'coway_bedroom']);
export const IndoorEntityAliasSchema = z.enum([
  'aranet_living_room.temperature', 'aranet_living_room.humidity', 'aranet_living_room.pressure', 'aranet_living_room.co2', 'aranet_living_room.battery',
  'nest_living_room.current_temperature', 'nest_living_room.humidity', 'nest_living_room.hvac_mode', 'nest_living_room.heat_setpoint', 'nest_living_room.cool_setpoint', 'nest_living_room.fan_timer',
  'coway_living_room.aqi', 'coway_living_room.pm25', 'coway_living_room.pm10', 'coway_living_room.filter_life', 'coway_living_room.power', 'coway_living_room.speed', 'coway_living_room.preset', 'coway_living_room.timer', 'coway_living_room.light', 'coway_living_room.button_lock', 'coway_living_room.sensitivity',
  'coway_bedroom.aqi', 'coway_bedroom.pm25', 'coway_bedroom.pm10', 'coway_bedroom.filter_life', 'coway_bedroom.power', 'coway_bedroom.speed', 'coway_bedroom.preset', 'coway_bedroom.timer', 'coway_bedroom.light', 'coway_bedroom.button_lock', 'coway_bedroom.sensitivity',
]);
export type IndoorEntityAlias = z.infer<typeof IndoorEntityAliasSchema>;
export const IndoorFreshnessSchema = z.enum(['CURRENT', 'STALE', 'NO_DATA', 'NOT_SUPPORTED', 'UNAVAILABLE']);
export const IndoorSourceStateSchema = z.enum(['AVAILABLE', 'DEGRADED', 'UNAVAILABLE']);
export const IndoorUnitSchema = z.enum(['°F', '%', 'hPa', 'ppm', 'µg/m³']);
export const IndoorMetadataSchema = z.object({
  source: z.enum(['ARANET_LOCAL', 'NEST_CLOUD', 'COWAY_CLOUD']),
  observedAt: z.string().datetime({ offset: true }),
  freshness: IndoorFreshnessSchema,
  sourceState: IndoorSourceStateSchema,
  severity: SeveritySchema,
  ageSeconds: z.number().nonnegative().optional(),
  message: z.string().max(240).optional(),
}).strict();
export const IndoorReadingSchema = z.object({
  alias: IndoorEntityAliasSchema,
  value: z.number().finite().nullable(),
  unit: IndoorUnitSchema,
  metadata: IndoorMetadataSchema,
}).strict();
const ControlDependencySchema = z.enum(['LOCAL', 'NEST_CLOUD', 'COWAY_CLOUD']);
const OptionCapabilitySchema = z.object({ supported: z.boolean(), options: z.array(z.string().min(1)), dependency: ControlDependencySchema }).strict();
const NumberCapabilitySchema = z.object({ supported: z.boolean(), values: z.array(z.number().finite()), dependency: ControlDependencySchema }).strict();
const BooleanCapabilitySchema = z.object({ supported: z.boolean(), dependency: z.literal('COWAY_CLOUD') }).strict();

export const AranetStateSchema = z.object({
  alias: z.literal('aranet_living_room'),
  room: z.literal('living_room'),
  sourceState: IndoorSourceStateSchema,
  readings: z.object({
    temperature: IndoorReadingSchema, humidity: IndoorReadingSchema, pressure: IndoorReadingSchema,
    co2: IndoorReadingSchema, battery: IndoorReadingSchema,
  }).strict(),
}).strict();
export const ThermostatStateSchema = z.object({
  alias: z.literal('nest_living_room'), room: z.literal('living_room'), stateVersion: z.string().min(1),
  sourceState: IndoorSourceStateSchema, dependency: z.literal('NEST_CLOUD'),
  currentTemperature: IndoorReadingSchema, humidity: IndoorReadingSchema,
  hvacMode: z.enum(['OFF', 'HEAT', 'COOL', 'HEAT_COOL']).nullable(),
  heatSetpointF: z.number().finite().nullable(), coolSetpointF: z.number().finite().nullable(),
  fanTimerEndsAt: z.string().datetime({ offset: true }).nullable(),
  capabilities: z.object({
    hvacModes: OptionCapabilitySchema,
    setpointShapes: z.array(z.enum(['HEAT', 'COOL', 'RANGE'])),
    setpointMinF: z.number().finite().nullable(), setpointMaxF: z.number().finite().nullable(), setpointStepF: z.number().positive().nullable(),
    fanTimerMinutes: NumberCapabilitySchema,
  }).strict(),
}).strict();
export const PurifierStateSchema = z.object({
  alias: PurifierAliasSchema, room: IndoorRoomAliasSchema, stateVersion: z.string().min(1),
  sourceState: IndoorSourceStateSchema, dependency: z.literal('COWAY_CLOUD'),
  power: z.boolean().nullable(), speed: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  preset: z.string().min(1).nullable(), timerEndsAt: z.string().datetime({ offset: true }).nullable(),
  light: z.string().min(1).nullable(), buttonLock: z.boolean().nullable(), sensitivity: z.string().min(1).nullable(),
  readings: z.object({ aqi: IndoorReadingSchema, pm25: IndoorReadingSchema, pm10: IndoorReadingSchema, filterLife: IndoorReadingSchema }).strict(),
  capabilities: z.object({
    power: BooleanCapabilitySchema, speeds: NumberCapabilitySchema, presets: OptionCapabilitySchema,
    timerMinutes: NumberCapabilitySchema, lightOptions: OptionCapabilitySchema,
    buttonLock: BooleanCapabilitySchema, sensitivityOptions: OptionCapabilitySchema,
  }).strict(),
}).strict();
export const IndoorRoomSummarySchema = z.object({
  alias: IndoorRoomAliasSchema, name: z.enum(['Living Room', 'Bedroom']),
  temperatureF: z.number().finite().nullable(), humidityPercent: z.number().finite().nullable(),
  co2Ppm: z.number().finite().nullable(), pm25WorstMicrogramsM3: z.number().finite().nullable(),
  activeAlertCount: z.number().int().nonnegative(), freshness: IndoorFreshnessSchema,
}).strict();
export const IndoorAlertSchema = z.object({
  id: z.string().min(1), room: IndoorRoomAliasSchema, device: IndoorDeviceAliasSchema.nullable(),
  kind: z.enum(['CO2', 'TEMPERATURE', 'HUMIDITY', 'PM25', 'BATTERY', 'FILTER', 'SOURCE_UNAVAILABLE', 'BACKUP']),
  severity: z.enum(['WARN', 'CRIT']), summary: z.string().max(240), startedAt: z.string().datetime({ offset: true }),
}).strict();
export const IndoorActionStatusSchema = z.object({
  actionId: z.string().min(1), target: z.enum(['nest_living_room', 'coway_living_room', 'coway_bedroom']),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT']), acceptedAt: z.string().datetime({ offset: true }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(), message: z.string().max(240).optional(),
}).strict();
export type IndoorActionStatus = z.infer<typeof IndoorActionStatusSchema>;
export const IndoorStateSchema = z.object({
  rooms: z.array(IndoorRoomSummarySchema),
  sensors: z.tuple([AranetStateSchema]),
  thermostats: z.tuple([ThermostatStateSchema]),
  purifiers: z.tuple([PurifierStateSchema, PurifierStateSchema]),
  alerts: z.array(IndoorAlertSchema),
  actions: z.array(IndoorActionStatusSchema).max(100),
}).strict();
export type IndoorState = z.infer<typeof IndoorStateSchema>;

export const IndoorTargetAliasSchema = z.enum(['nest_living_room', 'coway_living_room', 'coway_bedroom']);
const NestSetpointSchema = z.discriminatedUnion('shape', [
  z.object({ shape: z.literal('HEAT'), temperatureF: z.number().finite() }).strict(),
  z.object({ shape: z.literal('COOL'), temperatureF: z.number().finite() }).strict(),
  z.object({ shape: z.literal('RANGE'), heatTemperatureF: z.number().finite(), coolTemperatureF: z.number().finite() }).strict(),
]);
export const IndoorCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NEST_SET_HVAC_MODE'), target: z.literal('nest_living_room'), mode: z.enum(['OFF', 'HEAT', 'COOL', 'HEAT_COOL']) }).strict(),
  z.object({ type: z.literal('NEST_SET_SETPOINT'), target: z.literal('nest_living_room'), setpoint: NestSetpointSchema }).strict(),
  z.object({ type: z.literal('NEST_SET_FAN_TIMER'), target: z.literal('nest_living_room'), durationMinutes: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('COWAY_SET_POWER'), target: PurifierAliasSchema, power: z.boolean() }).strict(),
  z.object({ type: z.literal('COWAY_SET_PRESET'), target: PurifierAliasSchema, preset: z.string().min(1).max(32) }).strict(),
  z.object({ type: z.literal('COWAY_SET_SPEED'), target: PurifierAliasSchema, speed: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
  z.object({ type: z.literal('COWAY_SET_TIMER'), target: PurifierAliasSchema, durationMinutes: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('COWAY_SET_LIGHT'), target: PurifierAliasSchema, light: z.string().min(1).max(32) }).strict(),
  z.object({ type: z.literal('COWAY_SET_BUTTON_LOCK'), target: PurifierAliasSchema, locked: z.boolean() }).strict(),
  z.object({ type: z.literal('COWAY_SET_SENSITIVITY'), target: PurifierAliasSchema, sensitivity: z.string().min(1).max(32) }).strict(),
]);
export const IndoorActionRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  expectedStateVersion: z.string().min(1).max(128),
  confirmed: z.literal(true),
  command: IndoorCommandSchema,
}).strict();
export const IndoorActionAcceptedSchema = z.object({
  actionId: z.string().uuid(), target: IndoorTargetAliasSchema, status: z.literal('PENDING'),
  acceptedAt: z.string().datetime({ offset: true }),
}).strict();
export type IndoorCommand = z.infer<typeof IndoorCommandSchema>;
export type IndoorActionRequest = z.infer<typeof IndoorActionRequestSchema>;
export type IndoorActionAccepted = z.infer<typeof IndoorActionAcceptedSchema>;

export const BootstrapSchema = z.object({
  schemaVersion: z.literal(3),
  generatedAt: z.string().datetime({ offset: true }),
  globalSeverity: SeveritySchema,
  alerts: z.array(AlertSchema),
  timeSeries: z.array(TimeSeriesSchema),
  hosts: z.array(HostSchema),
  clusters: z.array(ClusterSchema),
  workloads: z.array(WorkloadSchema),
  network: NetworkSummarySchema,
  storage: StorageSummarySchema,
  storageBackups: z.array(StorageBackupSchema),
  services: z.array(ServiceStatusSchema),
  weather: WeatherSchema,
  indoor: IndoorStateSchema,
}).strict();
export type Bootstrap = z.infer<typeof BootstrapSchema>;

export const HistoryResponseSchema = z.object({
  data: TimeSeriesSchema,
  requestId: z.string().min(1),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

export const PublicConfigSchema = z.object({
  environment: z.enum(['development', 'test', 'production']),
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  shutdownGraceMs: z.number().int().positive().max(120_000),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
