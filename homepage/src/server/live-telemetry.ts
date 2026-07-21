import { readFile } from 'node:fs/promises';
import type { Bootstrap, Host, ServiceStatus, SourceMetadata, TimeSeries } from '../shared/contracts.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { GlancesAdapter, type GlancesFetch } from './glances.js';
import { AlertmanagerAdapter } from './alertmanager.js';
import { ArgoCdAdapter } from './argocd.js';
import { K3sAdapter, type K3sReadClient } from './k3s.js';
import { aggregateGlobalSeverity } from './normalization.js';
import { OpenMeteoAdapter } from './open-meteo.js';
import { PbsAdapter } from './pbs.js';
import { PrometheusAdapter } from './prometheus.js';
import { ProxmoxAdapter, type ProxmoxFetch, type ProxmoxHostConfig } from './proxmox.js';
import { AllowlistedProbeRunner } from './probes.js';
import { requestJson } from './request-json.js';
import type { RuntimeConfig } from './runtime-config.js';
import { UniFiAdapter } from './unifi.js';

export const POLL_INTERVAL_MS = 2_000;
const FULL_REFRESH_INTERVAL_MS = 6_000;
const HISTORY_LIMIT = 104;
const SECRET_ROOT = '/var/run/homepage-secrets';

type FetchResponse = { ok: boolean; json(): Promise<unknown> };
type SecretReader = (path: string) => Promise<string | null>;

const fetchJson = async (url: string, init?: RequestInit): Promise<FetchResponse> => {
  const response = await fetch(url, init);
  return { ok: response.ok, json: () => response.json() };
};

async function mountedSecret(path: string): Promise<string | null> {
  try { return (await readFile(path, 'utf8')).trim() || null; } catch { return null; }
}

function dynamicHost(id: string, name: string, metadata: SourceMetadata): Host {
  return {
    id, name, kind: 'PROXMOX', cpuPercent: null, memoryPercent: null, memoryUsedBytes: null, memoryTotalBytes: null,
    diskUsedBytes: null, diskTotalBytes: null, diskIoPercent: null, cpuModel: null, cpuCorePercentages: null,
    loadAverage: null, cpuClockMhz: null, powerWatts: null, swapUsedBytes: null, swapTotalBytes: null,
    uptimeSeconds: null, runningVmCount: null, stoppedVmCount: null, runningContainerCount: null,
    stoppedContainerCount: null, temperatureCelsius: null, networkIngressBitsPerSecond: null,
    networkEgressBitsPerSecond: null, networkTotalBytes: null, metadata,
  };
}

function value<T>(preferred: T | null, fallback: T | null): T | null { return preferred ?? fallback; }

function mergedHost(id: string, name: string, proxmox: Host | undefined, glances: Host | undefined, now: string): Host {
  const metadata: SourceMetadata = {
    source: 'proxmox+glances', observedAt: now,
    freshness: proxmox?.metadata.freshness === 'CURRENT' || glances?.metadata.freshness === 'CURRENT' ? 'CURRENT' : 'NO_DATA',
    severity: proxmox?.metadata.severity === 'CRIT' || glances?.metadata.severity === 'CRIT' ? 'CRIT' : proxmox?.metadata.severity === 'WARN' || glances?.metadata.severity === 'WARN' ? 'WARN' : 'OK',
    ...(proxmox?.metadata.freshness !== 'CURRENT' && glances?.metadata.freshness !== 'CURRENT' ? { message: 'No current approved telemetry sample is available.' } : {}),
  };
  const blank = dynamicHost(id, name, metadata);
  return {
    ...blank,
    cpuPercent: value(glances?.cpuPercent ?? null, proxmox?.cpuPercent ?? null),
    memoryPercent: value(glances?.memoryPercent ?? null, proxmox?.memoryPercent ?? null),
    memoryUsedBytes: value(glances?.memoryUsedBytes ?? null, proxmox?.memoryUsedBytes ?? null),
    memoryTotalBytes: value(glances?.memoryTotalBytes ?? null, proxmox?.memoryTotalBytes ?? null),
    diskUsedBytes: value(proxmox?.diskUsedBytes ?? null, glances?.diskUsedBytes ?? null),
    diskTotalBytes: value(proxmox?.diskTotalBytes ?? null, glances?.diskTotalBytes ?? null),
    diskIoPercent: value(glances?.diskIoPercent ?? null, proxmox?.diskIoPercent ?? null),
    cpuModel: proxmox?.cpuModel ?? null,
    cpuCorePercentages: glances?.cpuCorePercentages ?? null,
    loadAverage: proxmox?.loadAverage ?? null,
    cpuClockMhz: proxmox?.cpuClockMhz ?? null,
    powerWatts: null,
    swapUsedBytes: proxmox?.swapUsedBytes ?? null,
    swapTotalBytes: proxmox?.swapTotalBytes ?? null,
    uptimeSeconds: value(glances?.uptimeSeconds ?? null, proxmox?.uptimeSeconds ?? null),
    runningVmCount: proxmox?.runningVmCount ?? null,
    stoppedVmCount: proxmox?.stoppedVmCount ?? null,
    runningContainerCount: proxmox?.runningContainerCount ?? null,
    stoppedContainerCount: proxmox?.stoppedContainerCount ?? null,
    temperatureCelsius: glances?.temperatureCelsius ?? null,
    networkIngressBitsPerSecond: glances?.networkIngressBitsPerSecond ?? null,
    networkEgressBitsPerSecond: glances?.networkEgressBitsPerSecond ?? null,
    networkTotalBytes: glances?.networkTotalBytes ?? null,
  };
}

export class LiveTelemetry {
  private readonly history = new Map<string, Array<{ timestamp: string; value: number }>>();
  private latest: Bootstrap | undefined;
  private graphTimer: ReturnType<typeof setInterval> | undefined;
  private fullTimer: ReturnType<typeof setInterval> | undefined;
  private graphPollInFlight = false;
  private fullPollInFlight = false;
  private lastSampleTimestampMs = 0;
  private glancesReadInFlight: Promise<Host[]> | undefined;
  private proxmox: ProxmoxAdapter | undefined;
  private k3s: K3sAdapter | undefined;
  private argocd: ArgoCdAdapter | undefined;
  private pbs: PbsAdapter | undefined;
  private unifi: UniFiAdapter | undefined;
  private readonly prometheus: PrometheusAdapter;
  private readonly alertmanager: AlertmanagerAdapter;
  private readonly weather: OpenMeteoAdapter;
  private readonly probes: AllowlistedProbeRunner;
  private readonly glances: GlancesAdapter;

  constructor(
    private readonly runtimeConfig: RuntimeConfig,
    private readonly publish: (bootstrap: Bootstrap) => void,
    private readonly secretReader: SecretReader = mountedSecret,
    private readonly httpFetch: typeof fetchJson = fetchJson,
  ) {
    this.glances = new GlancesAdapter([
      { id: 'pve-01', name: 'pve-01', endpoint: 'http://192.168.40.20:61208' },
      { id: 'pve-02', name: 'pve-02', endpoint: 'http://192.168.40.25:61208' },
    ], (url) => this.httpFetch(url) as ReturnType<GlancesFetch>, this.runtimeConfig.featureFlags.proxmox);
    this.prometheus = new PrometheusAdapter(this.sourceEndpoint('prometheus-source'), this.runtimeConfig.featureFlags.prometheus, this.runtimeConfig.pduPower);
    this.alertmanager = new AlertmanagerAdapter('http://kube-prometheus-stack-alertmanager.monitoring.svc:9093', this.runtimeConfig.featureFlags.prometheus);
    this.weather = new OpenMeteoAdapter({ fetch: (url) => this.httpFetch(url), latitude: runtimeConfig.weatherLocation.latitude, longitude: runtimeConfig.weatherLocation.longitude, enabled: runtimeConfig.featureFlags.weather });
    this.probes = new AllowlistedProbeRunner(runtimeConfig, (url, init) => fetch(url, init), { now: () => new Date() });
  }

  async start() {
    await this.refresh();
    this.graphTimer = setInterval(() => { void this.pollGraph().catch(() => undefined); }, POLL_INTERVAL_MS);
    this.fullTimer = setInterval(() => { void this.pollFull().catch(() => undefined); }, FULL_REFRESH_INTERVAL_MS);
    this.graphTimer.unref();
    this.fullTimer.unref();
  }
  stop() {
    if (this.graphTimer) clearInterval(this.graphTimer);
    if (this.fullTimer) clearInterval(this.fullTimer);
  }
  bootstrap = () => this.latest ?? this.emptyBootstrap();

  private async pollGraph() {
    if (this.graphPollInFlight) return;
    this.graphPollInFlight = true;
    try {
      await this.refreshGraphTelemetry();
    } finally {
      this.graphPollInFlight = false;
    }
  }

  private async pollFull() {
    if (this.fullPollInFlight) return;
    this.fullPollInFlight = true;
    try {
      await this.refresh(false);
    } finally {
      this.fullPollInFlight = false;
    }
  }

  private async proxmoxHosts() {
    const configured = await Promise.all([
      this.proxmoxConfig('pve-01', 'pve-01', 'pve01', 'pve01'),
      this.proxmoxConfig('pve-02', 'pve-02', 'pve-02', 'pve02'),
    ]);
    const hosts = configured.filter((host): host is ProxmoxHostConfig => host !== null);
    this.proxmox ??= new ProxmoxAdapter(hosts, this.runtimeConfig.featureFlags.proxmox);
    return this.proxmox.read((url, init) => this.httpFetch(url, init) as ReturnType<ProxmoxFetch>);
  }

  private async proxmoxConfig(id: string, name: string, node: string, secretName: string): Promise<ProxmoxHostConfig | null> {
    const base = `${SECRET_ROOT}/${secretName}`;
    const [server, tokenId, tokenSecret] = await Promise.all([this.secretReader(`${base}/server`), this.secretReader(`${base}/token-id`), this.secretReader(`${base}/token-secret`)]);
    return server && tokenId && tokenSecret ? { id, name, node, server, tokenId, tokenSecret } : null;
  }

  private async glancesHosts() {
    this.glancesReadInFlight ??= this.glances.read().finally(() => { this.glancesReadInFlight = undefined; });
    return this.glancesReadInFlight;
  }

  private sourceEndpoint(id: string) {
    const endpoint = this.runtimeConfig.sources.find((source) => source.id === id)?.endpoint;
    if (!endpoint) throw new Error(`Missing runtime source: ${id}`);
    return endpoint;
  }

  private async k3sSnapshot() {
    if (!this.k3s) {
      const [token, caCertificate] = await Promise.all([
        this.secretReader('/var/run/secrets/kubernetes.io/serviceaccount/token'),
        this.secretReader('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt'),
      ]);
      if (!token || !caCertificate) return null;
      const request = (path: string) => requestJson(`https://kubernetes.default.svc${path}`, { headers: { authorization: `Bearer ${token}` }, caCertificate, timeoutMs: 3_000 }).then((response) => {
        if (!response.ok) throw new Error(`Kubernetes API returned ${response.status}.`);
        return response.json();
      });
      const client: K3sReadClient = {
        listNodes: () => request('/api/v1/nodes'),
        listDeployments: () => request('/apis/apps/v1/deployments'),
        listStatefulSets: () => request('/apis/apps/v1/statefulsets'),
        listDaemonSets: () => request('/apis/apps/v1/daemonsets'),
        listNodeMetrics: () => request('/apis/metrics.k8s.io/v1beta1/nodes'),
      };
      this.k3s = new K3sAdapter(client);
    }
    return this.k3s.read();
  }

  private async argocdApplications() {
    if (!this.argocd) {
      const [server, token] = await Promise.all([this.secretReader(`${SECRET_ROOT}/argocd/server`), this.secretReader(`${SECRET_ROOT}/argocd/token`)]);
      if (!server || !token) return null;
      this.argocd = new ArgoCdAdapter(server, token, this.runtimeConfig.featureFlags.argocd);
    }
    return this.argocd.read((url, init) => this.httpFetch(url, init) as ReturnType<Parameters<ArgoCdAdapter['read']>[0]>);
  }

  private async pbsSnapshot() {
    if (!this.pbs) {
      const base = `${SECRET_ROOT}/pbs`;
      const [server, tokenId, tokenSecret, caCertificate] = await Promise.all([this.secretReader(`${base}/server`), this.secretReader(`${base}/token-id`), this.secretReader(`${base}/token-secret`), this.secretReader(`${base}/ca`)]);
      if (!server || !tokenId || !tokenSecret || !caCertificate) return null;
      this.pbs = new PbsAdapter({ id: 'pbs-01', name: 'pbs-01', datastore: 'pve02-backups', server, tokenId, tokenSecret, caCertificate }, this.runtimeConfig.featureFlags.pbs);
    }
    return this.pbs.read((url, init) => requestJson(url, { headers: init.headers, caCertificate: init.caCertificate, timeoutMs: 5_000 }));
  }

  private async unifiSnapshot() {
    if (!this.unifi) {
      const [server, token] = await Promise.all([this.secretReader(`${SECRET_ROOT}/unifi/server`), this.secretReader(`${SECRET_ROOT}/unifi/token`)]);
      if (!server || !token) return null;
      this.unifi = new UniFiAdapter({ server, token }, this.runtimeConfig.featureFlags.unifi);
    }
    return this.unifi.read((url, init) => this.httpFetch(url, init) as ReturnType<Parameters<UniFiAdapter['read']>[0]>);
  }

  async refresh(recordGraphSample = true) {
    const [proxmox, glances, k3s, prometheus, pduPower, udm, alerts, argocd, pbs, unifi, weather, probes] = await Promise.all([
      this.proxmoxHosts(), this.glancesHosts(), this.k3sSnapshot(),
      this.prometheus.readCluster((url) => this.httpFetch(url)),
      this.prometheus.readPduPower((url) => this.httpFetch(url)),
      this.prometheus.readUdm((url) => this.httpFetch(url)),
      this.alertmanager.read((url) => this.httpFetch(url)),
      this.argocdApplications(), this.pbsSnapshot(), this.unifiSnapshot(), this.weather.read(), this.probes.runConfigured(),
    ]);
    const now = new Date().toISOString();
    const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
    const proxmoxById = byId(proxmox);
    const glancesById = byId(glances);
    const pduWatts: Record<string, number | null> = { 'pve-01': pduPower.pve01Watts, 'pve-02': pduPower.pve02Watts };
    const proxmoxHosts = ['pve-01', 'pve-02'].map((id) => ({ ...mergedHost(id, id, proxmoxById.get(id), glancesById.get(id), now), powerWatts: pduWatts[id] ?? null }));
    if (recordGraphSample) {
      const sampleTimestamp = this.nextSampleTimestamp(now);
      for (const host of proxmoxHosts) this.recordHost(host, sampleTimestamp);
    }
    const base = this.emptyBootstrap();
    base.generatedAt = now;
    base.hosts = [...proxmoxHosts, ...(k3s?.hosts ?? []) , ...base.hosts.filter((host) => host.kind === 'OKD_NODE')];
    base.clusters = base.clusters.map((cluster) => {
      if (cluster.platform !== 'K3S') return cluster;
      if (!k3s) return { ...cluster, nodeCount: null, readyNodeCount: null, workloadCount: null, cpuCapacityCores: null, cpuUsedCores: null, memoryCapacityBytes: null, memoryUsedBytes: null, metadata: { source: 'k3s-api', observedAt: now, freshness: 'NO_DATA', severity: 'INFO', message: 'No successful k3s API sample is available.' } };
      return {
        ...k3s.cluster,
        cpuCapacityCores: prometheus?.cpuCapacityCores ?? k3s.cluster.cpuCapacityCores,
        cpuUsedCores: prometheus?.cpuUsedCores ?? k3s.cluster.cpuUsedCores,
        memoryCapacityBytes: prometheus?.memoryCapacityBytes ?? k3s.cluster.memoryCapacityBytes,
        memoryUsedBytes: prometheus?.memoryUsedBytes ?? k3s.cluster.memoryUsedBytes,
      };
    });
    base.workloads = k3s?.workloads ?? [];
    base.alerts = alerts;
    base.timeSeries = this.timeSeries(proxmoxHosts);
    if (pbs) { base.storage = pbs.storage; base.storageBackups = pbs.backups; }
    base.network = { ...base.network, udm, pduPower: { totalWatts: pduPower.totalWatts, metadata: pduPower.metadata } };
    if (unifi) base.network = { ...base.network, ...unifi, metadata: unifi.unifi.metadata };
    base.weather = weather;
    base.services = this.liveServices(probes, argocd);
    base.globalSeverity = aggregateGlobalSeverity([
      ...base.hosts.map((host) => ({ metadata: host.metadata })),
      ...base.clusters.map((cluster) => ({ metadata: cluster.metadata })),
      ...base.alerts.map((alert) => ({ metadata: alert.metadata })),
      { metadata: base.network.metadata }, { metadata: base.storage.pbs.metadata }, { metadata: base.weather.metadata },
      ...base.services.map((service) => ({ metadata: service.metadata })),
    ]);
    this.latest = base;
    this.publish(base);
  }

  private async refreshGraphTelemetry() {
    if (!this.latest) return this.refresh();
    const glances = await this.glancesHosts();
    const now = new Date().toISOString();
    const previousById = new Map(this.latest.hosts.filter((host) => host.kind === 'PROXMOX').map((host) => [host.id, host]));
    const glancesById = new Map(glances.map((host) => [host.id, host]));
    const proxmoxHosts = ['pve-01', 'pve-02'].map((id) => {
      const previous = previousById.get(id);
      return { ...mergedHost(id, id, previous, glancesById.get(id), now), powerWatts: previous?.powerWatts ?? null };
    });
    const sampleTimestamp = this.nextSampleTimestamp(now);
    for (const host of proxmoxHosts) this.recordHost(host, sampleTimestamp);

    const base = structuredClone(this.latest);
    base.generatedAt = now;
    base.hosts = [...proxmoxHosts, ...base.hosts.filter((host) => host.kind !== 'PROXMOX')];
    base.timeSeries = this.timeSeries(proxmoxHosts);
    base.globalSeverity = aggregateGlobalSeverity([
      ...base.hosts.map((host) => ({ metadata: host.metadata })),
      ...base.clusters.map((cluster) => ({ metadata: cluster.metadata })),
      ...base.alerts.map((alert) => ({ metadata: alert.metadata })),
      { metadata: base.network.metadata }, { metadata: base.storage.pbs.metadata }, { metadata: base.weather.metadata },
      ...base.services.map((service) => ({ metadata: service.metadata })),
    ]);
    this.latest = base;
    this.publish(base);
  }

  private emptyBootstrap(): Bootstrap {
    const base = structuredClone(healthyBootstrapFixture);
    base.alerts = [];
    base.timeSeries = [];
    const observedAt = new Date().toISOString();
    const unavailable: SourceMetadata = { source: 'live-telemetry', observedAt, freshness: 'NO_DATA', severity: 'INFO', message: 'No successful live sample is available.' };
    base.network = { ...base.network, gatewayLatencyMs: null, gatewayLatencyProtocol: null, internetLatencyMs: null, internetLatencyProtocol: null, unifi: { controller: null, status: null, metadata: unavailable }, udm: { wanDownloadMbps: null, wanUploadMbps: null, wanTotalBytes: null, latencyMs: null, cpuPercent: null, memoryPercent: null, temperatureCelsius: null, uptimeSeconds: null, clientCount: null, metadata: unavailable }, pduPower: { totalWatts: null, metadata: unavailable }, lastSpeedTest: { downloadMbps: null, uploadMbps: null, latencyMs: null, observedAt: null, metadata: unavailable }, metadata: unavailable };
    base.storage = { ...base.storage, pbs: { ...base.storage.pbs, reachable: null, metadata: unavailable } };
    base.storageBackups = [];
    base.services = [];
    base.weather = { ...base.weather, temperatureFahrenheit: null, condition: null, sunrise: null, sunset: null, usAqi: null, pm25: null, pm10: null, conditionsMetadata: unavailable, airQualityMetadata: unavailable, metadata: unavailable };
    return base;
  }

  private liveServices(probes: Awaited<ReturnType<AllowlistedProbeRunner['runConfigured']>>, argocd: Awaited<ReturnType<ArgoCdAdapter['read']>>): ServiceStatus[] {
    const probeById = new Map(probes.map((probe) => [probe.id, probe]));
    const argoSeverity = argocd?.reduce<SourceMetadata['severity']>((highest, app) => ({ OK: 0, INFO: 1, WARN: 2, CRIT: 3 }[app.metadata.severity] > { OK: 0, INFO: 1, WARN: 2, CRIT: 3 }[highest] ? app.metadata.severity : highest), 'OK');
    return this.runtimeConfig.serviceLinks.map((link) => {
      const probe = probeById.get(`${link.id}-probe`) ?? (link.id === 'argocd' ? probeById.get('argocd-probe') : undefined);
      const metadata: SourceMetadata = probe?.metadata ?? { source: link.id === 'argocd' && argocd ? 'argocd-api' : 'service-catalog', observedAt: new Date().toISOString(), freshness: 'NO_DATA', severity: link.id === 'argocd' && argoSeverity ? argoSeverity : 'INFO', message: 'No configured reachability probe.' };
      return { id: link.id, name: link.label, group: link.group, description: probe ? 'Allowlisted reachability check' : 'Read-only service link', href: link.href, status: probe?.status ?? (metadata.severity === 'CRIT' ? 'DOWN' : 'DEGRADED'), latencyMs: probe?.latencyMs ?? null, metadata };
    });
  }

  private recordHost(host: Host, timestamp: string) {
    const metrics: Array<[string, number | null]> = [
      [`${host.name} CPU`, host.cpuPercent], [`${host.name} MEMORY`, host.memoryPercent],
      [`${host.name} DISK`, host.diskUsedBytes !== null && host.diskTotalBytes ? host.diskUsedBytes / host.diskTotalBytes * 100 : null],
      [`${host.name} RX`, host.networkIngressBitsPerSecond === null ? null : host.networkIngressBitsPerSecond / 1_000_000],
      [`${host.name} TX`, host.networkEgressBitsPerSecond === null ? null : host.networkEgressBitsPerSecond / 1_000_000],
      ...(host.cpuCorePercentages?.map((value, index): [string, number] => [`${host.name} CORE ${index}`, value]) ?? []),
    ];
    for (const [metric, sample] of metrics) {
      if (sample === null || !Number.isFinite(sample)) continue;
      const points = this.history.get(metric) ?? [];
      points.push({ timestamp, value: Number(sample.toFixed(2)) });
      this.history.set(metric, points.slice(-HISTORY_LIMIT));
    }
  }

  private nextSampleTimestamp(observedAt: string) {
    const timestampMs = Math.max(Date.parse(observedAt), this.lastSampleTimestampMs + 1);
    this.lastSampleTimestampMs = timestampMs;
    return new Date(timestampMs).toISOString();
  }

  private timeSeries(hosts: Host[]): TimeSeries[] {
    const current = new Map(hosts.map((host) => [host.name, host]));
    return [...this.history.entries()].map(([metric, points]) => {
      const host = current.get(metric.split(' ')[0]!);
      return { metric, unit: metric.endsWith('RX') || metric.endsWith('TX') ? 'Mb/s' : '%', window: '15m', points, metadata: host?.metadata ?? { source: 'proxmox+glances', observedAt: new Date().toISOString(), freshness: 'NO_DATA', severity: 'INFO' } };
    });
  }
}
