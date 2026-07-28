import type { Bootstrap, Cluster, Host } from '../shared/contracts.js';

export interface OverviewModel {
  alerts: Bootstrap['alerts'];
  globalSeverity: Bootstrap['globalSeverity'];
  proxmoxHosts: Host[];
  k3sNodes: Host[];
  futureOkdNodes: Host[];
  k3s: Cluster | undefined;
  futureOkd: Cluster | undefined;
  workloads: Bootstrap['workloads'];
  network: Bootstrap['network'];
  services: Bootstrap['services'];
  weather: Bootstrap['weather'];
}

export function buildOverviewModel(bootstrap: Bootstrap): OverviewModel {
  return {
    alerts: [...bootstrap.alerts].sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    globalSeverity: bootstrap.globalSeverity,
    proxmoxHosts: bootstrap.hosts.filter((host) => host.kind === 'PROXMOX'),
    k3sNodes: bootstrap.hosts.filter((host) => host.kind === 'K3S_NODE'),
    futureOkdNodes: bootstrap.hosts.filter((host) => host.kind === 'OKD_NODE'),
    k3s: bootstrap.clusters.find((cluster) => cluster.platform === 'K3S'),
    futureOkd: bootstrap.clusters.find((cluster) => cluster.platform === 'OKD'),
    workloads: bootstrap.workloads,
    network: bootstrap.network,
    services: bootstrap.services,
    weather: bootstrap.weather,
  };
}

export function bytesToGiB(value: number | null) {
  return value === null ? '—' : (value / (1024 ** 3)).toFixed(1);
}

export function bytesToTiB(value: number | null) {
  return value === null ? '—' : (value / (1024 ** 4)).toFixed(2);
}
