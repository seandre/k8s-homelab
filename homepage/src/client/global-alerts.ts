import type { Bootstrap, Severity, SourceMetadata } from '../shared/contracts.js';

export type GlobalAlertItem = {
  id: string;
  name: string;
  summary: string;
  severity: Exclude<Severity, 'OK'>;
  href: string;
};

function active(metadata: SourceMetadata) {
  return metadata.severity !== 'OK'
    && metadata.freshness !== 'NOT_PROVISIONED'
    && metadata.freshness !== 'NOT_SUPPORTED';
}

function summary(name: string, metadata: SourceMetadata) {
  return metadata.message ?? `${name} is ${metadata.freshness.replaceAll('_', ' ').toLowerCase()}.`;
}

function destinationForAlert(name: string, source: string, alertSummary: string) {
  const value = `${name} ${source} ${alertSummary}`.toLowerCase();
  if (/weather|open.?meteo|air quality/.test(value)) return '/weather#weather-conditions';
  if (/indoor|aranet|coway|nest|co2|pm2/.test(value)) return '/indoor#indoor-current';
  if (/backup|pbs|storage|datastore/.test(value)) return '/storage-backups#pbs-status';
  if (/network|unifi|internet|gateway|pdu/.test(value)) return '/network#network-overview';
  if (/service|probe|endpoint|ingress/.test(value)) return '/services#services';
  if (/okd|openshift|clusteroperator/.test(value)) return '/okd#okd';
  if (/k3s|kube|node|pod|workload|deployment|daemonset|statefulset/.test(value)) return '/kubernetes#k3s-health-title';
  if (/proxmox|pve|host|cpu|memory|disk/.test(value)) return '/compute#proxmox-title';
  return '/#overview-alerts';
}

export function buildGlobalAlertItems(bootstrap: Bootstrap): GlobalAlertItem[] {
  const items: GlobalAlertItem[] = bootstrap.alerts
    .filter((alert) => alert.severity !== 'OK')
    .map((alert) => ({
      id: `alert-${alert.id}`,
      name: alert.name,
      summary: alert.summary,
      severity: alert.severity as Exclude<Severity, 'OK'>,
      href: destinationForAlert(alert.name, alert.source, alert.summary),
    }));
  const add = (id: string, name: string, metadata: SourceMetadata, href: string) => {
    if (!active(metadata)) return;
    items.push({
      id,
      name,
      summary: summary(name, metadata),
      severity: metadata.severity as Exclude<Severity, 'OK'>,
      href,
    });
  };

  for (const host of bootstrap.hosts) {
    add(
      `host-${host.id}`,
      host.name,
      host.metadata,
      host.kind === 'PROXMOX' ? '/compute#proxmox-title' : host.kind === 'K3S_NODE' ? '/kubernetes#k3s-health-title' : '/okd#okd-node-health',
    );
  }
  const specificClusterCauses = new Set<string>();
  for (const host of bootstrap.hosts) if (active(host.metadata) && host.kind !== 'PROXMOX') specificClusterCauses.add(host.kind === 'OKD_NODE' ? 'okd' : 'k3s');
  for (const workload of bootstrap.workloads) if (active(workload.metadata)) specificClusterCauses.add(workload.clusterId);
  for (const operator of bootstrap.platformOperators) if (active(operator.metadata)) specificClusterCauses.add(operator.clusterId);
  for (const cluster of bootstrap.clusters) {
    if (!specificClusterCauses.has(cluster.id)) add(`cluster-${cluster.id}`, cluster.name, cluster.metadata, cluster.platform === 'K3S' ? '/kubernetes#cluster-summary' : '/okd#okd');
  }
  for (const workload of bootstrap.workloads) add(`workload-${workload.id}`, `${workload.namespace}/${workload.name}`, workload.metadata, workload.clusterId === 'okd' ? '/okd#okd-workloads' : '/kubernetes#k3s-workload-title');
  for (const operator of bootstrap.platformOperators) add(`operator-${operator.id}`, operator.name, operator.metadata, '/okd#okd-operators');
  add('network', 'Network', bootstrap.network.metadata, '/network#network-overview');
  add('pbs', 'Proxmox Backup Server', bootstrap.storage.pbs.metadata, '/storage-backups#pbs-status');
  add('weather-conditions', 'Weather conditions', bootstrap.weather.conditionsMetadata, '/weather#weather-conditions');
  add('weather-air-quality', 'Weather air quality', bootstrap.weather.airQualityMetadata, '/weather#weather-air-quality');
  for (const service of bootstrap.services) add(`service-${service.id}`, service.name, service.metadata, '/services#services');

  const rank = { INFO: 1, WARN: 2, CRIT: 3 };
  return items.sort((left, right) => rank[right.severity] - rank[left.severity] || left.name.localeCompare(right.name));
}
