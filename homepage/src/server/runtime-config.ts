import { z } from 'zod';

const HttpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'https:' || protocol === 'http:';
}, 'Only HTTP(S) endpoints are allowed.');

const ServiceLinkSchema = z.object({ id: z.string().min(1), label: z.string().min(1), href: HttpUrlSchema, group: z.string().min(1) }).strict();
const SourceSchema = z.object({ id: z.string().min(1), enabled: z.boolean(), endpoint: HttpUrlSchema, timeoutMs: z.number().int().min(100).max(10_000), stateWhenDisabled: z.enum(['NOT_PROVISIONED', 'NOT_SUPPORTED']) }).strict();
const ProbeSchema = z.object({ id: z.string().min(1), sourceId: z.string().min(1), target: HttpUrlSchema, protocol: z.enum(['HTTPS', 'TCP', 'DNS']), intervalMs: z.number().int().min(1_000).max(300_000) }).strict();
const CredentialReferenceSchema = z.object({ id: z.string().min(1), namespace: z.string().min(1), secretName: z.string().min(1), keys: z.array(z.string().min(1)).min(1) }).strict();
const PduPowerConfigSchema = z.object({ enabled: z.boolean(), deviceName: z.string().min(1) }).strict();

export const RuntimeConfigSchema = z.object({
  allowedHosts: z.array(z.string().min(1)).min(1),
  views: z.array(z.object({ id: z.string().min(1), enabled: z.boolean() }).strict()).min(1),
  defaultLayout: z.object({ navigation: z.enum(['expanded', 'compact']), density: z.enum(['compact', 'comfortable']), overview: z.enum(['balanced', 'systems-first']) }).strict(),
  serviceLinks: z.array(ServiceLinkSchema).min(1),
  sources: z.array(SourceSchema).min(1),
  probes: z.array(ProbeSchema),
  credentialReferences: z.array(CredentialReferenceSchema),
  pduPower: PduPowerConfigSchema,
  historyMetrics: z.array(z.object({ metric: z.string().min(1), windows: z.array(z.enum(['5m', '15m', '1h', '3h', '6h', '24h', '7d', '30d', 'custom'])).min(1) }).strict()).min(1),
  thresholds: z.object({ cpuWarnPercent: z.number().min(0).max(100), cpuCritPercent: z.number().min(0).max(100), backupWarnAgeSeconds: z.number().int().positive() }).strict(),
  weatherLocation: z.object({ postalCode: z.literal('97209'), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict(),
  featureFlags: z.object({ fixtures: z.boolean(), weather: z.boolean(), probes: z.boolean(), prometheus: z.boolean(), argocd: z.boolean(), proxmox: z.boolean(), pbs: z.boolean(), unifi: z.boolean(), okd: z.boolean() }).strict(),
}).strict().superRefine((config, context) => {
  const ids = [...config.views.map(({ id }) => id), ...config.serviceLinks.map(({ id }) => id), ...config.sources.map(({ id }) => id), ...config.probes.map(({ id }) => id)];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'IDs must be unique across configuration sections.' });
  if (config.thresholds.cpuWarnPercent >= config.thresholds.cpuCritPercent) context.addIssue({ code: z.ZodIssueCode.custom, path: ['thresholds'], message: 'CPU warning threshold must be lower than critical threshold.' });
  const sources = new Set(config.sources.map(({ id }) => id));
  for (const probe of config.probes) if (!sources.has(probe.sourceId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['probes'], message: `Probe ${probe.id} references an unknown source.` });
  const allowed = new Set(config.allowedHosts);
  for (const endpoint of [...config.serviceLinks.map(({ href }) => href), ...config.sources.map(({ endpoint }) => endpoint), ...config.probes.map(({ target }) => target)]) {
    if (!allowed.has(new URL(endpoint).hostname)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Endpoint host ${new URL(endpoint).hostname} is not allowlisted.` });
  }
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export class RuntimeConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = 'RuntimeConfigurationError'; }
}

export function loadRuntimeConfig(input: unknown): RuntimeConfig {
  const parsed = RuntimeConfigSchema.safeParse(input);
  if (!parsed.success) throw new RuntimeConfigurationError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; '));
  return parsed.data;
}

export const gitOwnedRuntimeConfig: RuntimeConfig = loadRuntimeConfig({
  allowedHosts: ['argocd.lab.seandre.dev', 'grafana.lab.seandre.dev', 'api.okd.lab.seandre.dev', 'console-openshift-console.apps.okd.lab.seandre.dev', 'thanos-querier-openshift-monitoring.apps.okd.lab.seandre.dev', 'unifi.ui.com', 'api.ui.com', 'pve-01.lab.seandre.dev', 'pve-02.lab.seandre.dev', 'pbs-01.lab.seandre.dev', 'ha.lab.seandre.dev', 'nexus.lab.seandre.dev', 'docs.lab.seandre.dev', 'nginx-test.lab.seandre.dev', 'github.com', 'api.weatherapi.com', 'api.weather.gov', 'www.airnowapi.org', 'api.open-meteo.com', 'air-quality-api.open-meteo.com', 'argocd-server.argocd.svc', 'kube-prometheus-stack-grafana.monitoring.svc', 'homelab-docs.homelab-docs.svc', 'nginx-test.nginx-test.svc', 'home-assistant.home-assistant.svc', 'kube-prometheus-stack-prometheus.monitoring.svc', 'kube-prometheus-stack-alertmanager.monitoring.svc'],
  views: ['overview', 'compute', 'network', 'storage-backups', 'kubernetes', 'okd', 'services', 'weather'].map((id) => ({ id, enabled: true })),
  defaultLayout: { navigation: 'expanded', density: 'compact', overview: 'balanced' },
  serviceLinks: [
    ['argocd', 'Argo CD', 'https://argocd.lab.seandre.dev', 'Infrastructure'], ['grafana', 'Grafana', 'https://grafana.lab.seandre.dev', 'Infrastructure'], ['unifi', 'UniFi', 'https://unifi.ui.com', 'Infrastructure'],
    ['pve-01-link', 'pve-01', 'https://pve-01.lab.seandre.dev:8006', 'Host Status'], ['pve-02-link', 'pve-02', 'https://pve-02.lab.seandre.dev:8006', 'Host Status'], ['bastion-01', 'bastion-01', 'https://nexus.lab.seandre.dev', 'Host Status'],
    ['homelab-docs', 'Homelab Docs', 'https://docs.lab.seandre.dev', 'Apps'], ['nginx-test', 'nginx test', 'https://nginx-test.lab.seandre.dev', 'Apps'], ['repository', 'Repository', 'https://github.com/seandre/k8s-homelab', 'Homelab'], ['homepage-github', 'Homepage GitHub', 'https://github.com/gethomepage/homepage', 'Homelab'], ['okd-api', 'OKD API', 'https://api.okd.lab.seandre.dev:6443', 'Infrastructure'], ['okd-console', 'OKD Console', 'https://console-openshift-console.apps.okd.lab.seandre.dev', 'Infrastructure'],
  ].map(([id, label, href, group]) => ({ id, label, href, group })),
  sources: [
    { id: 'weather-source', enabled: true, endpoint: 'https://api.weather.gov', timeoutMs: 5_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'service-probes', enabled: true, endpoint: 'https://argocd.lab.seandre.dev', timeoutMs: 3_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'prometheus-source', enabled: true, endpoint: 'http://kube-prometheus-stack-prometheus.monitoring.svc:9090', timeoutMs: 5_000, stateWhenDisabled: 'NOT_PROVISIONED' },
    { id: 'argocd-source', enabled: true, endpoint: 'https://argocd.lab.seandre.dev', timeoutMs: 3_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'proxmox-pve01-source', enabled: true, endpoint: 'https://pve-01.lab.seandre.dev:8006/api2/json', timeoutMs: 5_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'proxmox-pve02-source', enabled: true, endpoint: 'https://pve-02.lab.seandre.dev:8006/api2/json', timeoutMs: 5_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'pbs-source', enabled: true, endpoint: 'https://pbs-01.lab.seandre.dev:8007/api2/json', timeoutMs: 5_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'unifi-source', enabled: true, endpoint: 'https://api.ui.com/v1', timeoutMs: 5_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'home-assistant-source', enabled: true, endpoint: 'http://home-assistant.home-assistant.svc:8123', timeoutMs: 5_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'okd-source', enabled: true, endpoint: 'https://api.okd.lab.seandre.dev:6443', timeoutMs: 3_000, stateWhenDisabled: 'NOT_SUPPORTED' },
    { id: 'okd-monitoring-source', enabled: true, endpoint: 'https://thanos-querier-openshift-monitoring.apps.okd.lab.seandre.dev', timeoutMs: 3_000, stateWhenDisabled: 'NOT_SUPPORTED' },
  ],
  probes: [
    ['argocd-probe', 'http://argocd-server.argocd.svc'],
    ['grafana-probe', 'http://kube-prometheus-stack-grafana.monitoring.svc'],
    ['unifi-probe', 'https://unifi.ui.com'],
    ['pve-01-link-probe', 'https://pve-01.lab.seandre.dev:8006'],
    ['pve-02-link-probe', 'https://pve-02.lab.seandre.dev:8006'],
    ['bastion-01-probe', 'https://nexus.lab.seandre.dev'],
    ['homelab-docs-probe', 'http://homelab-docs.homelab-docs.svc:8080'],
    ['nginx-test-probe', 'http://nginx-test.nginx-test.svc'],
    ['repository-probe', 'https://github.com/seandre/k8s-homelab'],
    ['homepage-github-probe', 'https://github.com/gethomepage/homepage'],
    ['okd-api-probe', 'https://api.okd.lab.seandre.dev:6443/readyz'],
    ['okd-console-probe', 'https://console-openshift-console.apps.okd.lab.seandre.dev'],
  ].map(([id, target]) => ({ id: id!, sourceId: 'service-probes', target: target!, protocol: target!.startsWith('https:') ? 'HTTPS' as const : 'TCP' as const, intervalMs: 30_000 })),
  credentialReferences: [
    { id: 'argocd-readonly', namespace: 'homepage', secretName: 'homepage-argocd-readonly', keys: ['server', 'token'] },
    { id: 'proxmox-pve01-readonly', namespace: 'homepage', secretName: 'homepage-proxmox-pve01', keys: ['server', 'token-id', 'token-secret'] },
    { id: 'proxmox-pve02-readonly', namespace: 'homepage', secretName: 'homepage-proxmox-pve02', keys: ['server', 'token-id', 'token-secret'] },
    { id: 'pbs-readonly', namespace: 'homepage', secretName: 'homepage-pbs-readonly', keys: ['server', 'token-id', 'token-secret', 'ca'] },
    { id: 'unifi-readonly', namespace: 'homepage', secretName: 'homepage-unifi-readonly', keys: ['server', 'token'] },
    { id: 'home-assistant-readonly', namespace: 'homepage', secretName: 'homepage-home-assistant-readonly', keys: ['token'] },
    { id: 'home-assistant-control', namespace: 'homepage', secretName: 'homepage-home-assistant-control', keys: ['mapping.json'] },
    { id: 'home-assistant-control-token', namespace: 'homepage', secretName: 'homepage-home-assistant-control-token', keys: ['token'] },
    { id: 'airnow-readonly', namespace: 'homepage', secretName: 'homepage-airnow-readonly', keys: ['api-key'] },
    { id: 'weatherapi-readonly', namespace: 'homepage', secretName: 'homepage-weatherapi-readonly', keys: ['api-key'] },
    { id: 'okd-readonly', namespace: 'homepage', secretName: 'homepage-okd-api', keys: ['server', 'token'] },
  ],
  // Validated against Prometheus: one USP-PDU-Pro device and one series for
  // each of the required pve-01, pve-02, and three okd-cp outlet labels.
  pduPower: { enabled: true, deviceName: 'USP-PDU-Pro' },
  historyMetrics: [
    ...['pve-01', 'pve-02'].flatMap((host) => ['CPU', 'MEMORY', 'DISK', 'RX', 'TX'].map((metric) => ({ metric: `${host} ${metric}`, windows: ['15m'] as const }))),
    ...['okd-cp-01', 'okd-cp-02', 'okd-cp-03'].flatMap((host) => ['CPU', 'MEMORY', ...Array.from({ length: 12 }, (_, index) => `CORE ${index}`)].map((metric) => ({ metric: `${host} ${metric}`, windows: ['15m'] as const }))),
    ...['CPU', 'MEMORY'].map((metric) => ({ metric: `okd ${metric}`, windows: ['15m'] as const })),
    ...Object.keys({
      'aranet_living_room.temperature': 1, 'aranet_living_room.humidity': 1, 'aranet_living_room.pressure': 1, 'aranet_living_room.co2': 1, 'aranet_living_room.battery': 1,
      'nest_living_room.current_temperature': 1, 'nest_living_room.humidity': 1,
      'coway_living_room.aqi': 1, 'coway_living_room.pm25': 1, 'coway_living_room.pm10': 1, 'coway_living_room.filter_life': 1,
      'coway_bedroom.aqi': 1, 'coway_bedroom.pm25': 1, 'coway_bedroom.pm10': 1, 'coway_bedroom.filter_life': 1,
      'airgradient_living_room.temperature': 1, 'airgradient_living_room.humidity': 1, 'airgradient_living_room.co2': 1,
      'airgradient_living_room.pm25': 1, 'airgradient_living_room.pm10': 1, 'airgradient_living_room.tvoc_index': 1,
      'airgradient_living_room.nox_index': 1,
      'outdoor.us_aqi': 1, 'outdoor.pm25': 1, 'outdoor.pm10': 1,
      'outdoor.temperature': 1, 'outdoor.humidity': 1, 'outdoor.precipitation': 1, 'outdoor.wind_speed': 1,
    }).map((metric) => ({ metric, windows: ['1h', '3h', '6h', '24h', '7d', '30d', 'custom'] as const })),
  ],
  thresholds: { cpuWarnPercent: 70, cpuCritPercent: 90, backupWarnAgeSeconds: 86_400 },
  weatherLocation: { postalCode: '97209', latitude: 45.527412, longitude: -122.686270 },
  featureFlags: { fixtures: false, weather: true, probes: true, prometheus: true, argocd: true, proxmox: true, pbs: true, unifi: true, okd: true },
});
