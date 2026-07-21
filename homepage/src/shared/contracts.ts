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
  window: z.enum(['5m', '15m', '1h']),
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

export const BootstrapSchema = z.object({
  schemaVersion: z.literal(2),
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
