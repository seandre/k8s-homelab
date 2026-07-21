import React from 'react';
import { useMemo, useState } from 'react';
import { ComponentGallery, Metric, Panel, StateBadge } from './components.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { buildOverviewModel } from './overview.js';
import { ProxmoxPanel } from './proxmox.js';
import type { Bootstrap } from '../shared/contracts.js';

function oneDecimal(value: number | null) { return value === null ? '—' : value.toFixed(1); }
function uptimeDays(seconds: number | null) { return seconds === null ? '—' : `${Math.floor(seconds / 86_400)}d`; }
function byteCount(value: number | null) {
  if (value === null) return '—';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(Math.max(value, 1)) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function OverviewScreen({ search, bootstrap = healthyBootstrapFixture }: { search: string; bootstrap?: Bootstrap }) {
  const [expandedHosts, setExpandedHosts] = useState<string[]>([]);
  const toggleExpandedHost = (hostId: string) => setExpandedHosts((current) => current.includes(hostId) ? current.filter((id) => id !== hostId) : [...current, hostId]);
  const data = bootstrap;
  const overview = buildOverviewModel(data);
  const primaryCluster = overview.k3s!;
  const futureOkd = overview.futureOkd!;
  const filteredServices = useMemo(() => overview.services.filter((service) => `${service.name} ${service.group} ${service.description}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6), [overview.services, search]);
  const alert = overview.alerts[0];
  return (
    <>
      <main className="dashboard" id="overview">
        <section className="hero-row"><div><span className="panel-eyebrow">OVERVIEW / READ-ONLY TELEMETRY</span><h1>Operations at a glance</h1></div><div className="hero-state"><StateBadge severity={overview.globalSeverity} label={`${overview.globalSeverity} · ${overview.alerts.length} alert`} /><span>Last refresh {data.generatedAt.slice(11, 19)} UTC</span></div></section>
        {alert ? <section className="alert-strip" aria-label="Active alerts"><StateBadge severity={alert.severity} /><strong>{overview.alerts.length} active alert{overview.alerts.length === 1 ? '' : 's'}</strong><span>{alert.summary}</span><a href="/kubernetes">View Kubernetes ↗</a></section> : null}
        <div className="pve-overview">
          {overview.proxmoxHosts.map((host) => <ProxmoxPanel key={host.id} host={host} timeSeries={data.timeSeries} expanded={expandedHosts.includes(host.id)} onExpand={() => toggleExpandedHost(host.id)} />)}
          <Panel className="process-box" title="Services" eyebrow="PROCESS / REACHABILITY" severity="WARN"><div className="service-columns" aria-hidden="true"><span>SERVICE</span><span>SOURCE</span><span>STATE</span></div><div className="service-list">{filteredServices.map((service) => <a href={service.href} target="_blank" rel="noreferrer" key={service.id}><strong>{service.name}</strong><small>{service.metadata.source.replace('fixture-', '')}</small><StateBadge severity={service.metadata.severity} label={service.status} /></a>)}</div>{filteredServices.length === 0 ? <div className="empty-state">No local matches. Try a different search.</div> : null}</Panel>
          <div className="pve-workload-row">
            <Panel className="network-box" title="UDM Pro" eyebrow="NETWORK / UNPOLLER" severity={overview.network.udm.metadata.severity} freshness={overview.network.udm.metadata.freshness} href="https://unifi.ui.com"><div className="metric-grid"><Metric label="STATUS" value={overview.network.unifi.status ?? '—'} detail={overview.network.unifi.controller ?? 'UniFi Site Manager'} /><Metric label="WAN LATENCY" value={overview.network.udm.latencyMs === null ? '—' : Math.round(overview.network.udm.latencyMs)} unit="ms" /><Metric label="CLIENTS" value={overview.network.udm.clientCount ?? '—'} /></div><div className="metric-grid"><Metric label="WAN DOWN" value={oneDecimal(overview.network.udm.wanDownloadMbps)} unit="Mb/s" /><Metric label="WAN UP" value={oneDecimal(overview.network.udm.wanUploadMbps)} unit="Mb/s" /><Metric label="TOTAL TRANSFER" value={byteCount(overview.network.udm.wanTotalBytes)} /></div><div className="metric-grid"><Metric label="CPU" value={oneDecimal(overview.network.udm.cpuPercent)} unit="%" /><Metric label="MEMORY" value={oneDecimal(overview.network.udm.memoryPercent)} unit="%" /><Metric label="TEMP" value={oneDecimal(overview.network.udm.temperatureCelsius)} unit="°C" /><Metric label="UPTIME" value={uptimeDays(overview.network.udm.uptimeSeconds)} /></div></Panel>
            <Panel className="workload-box" title="Kubernetes" eyebrow="WORKLOAD / k3s" severity={primaryCluster.metadata.severity} freshness={primaryCluster.metadata.freshness} href="https://argocd.lab.seandre.dev"><div className="metric-grid"><Metric label="NODES" value={`${primaryCluster.readyNodeCount ?? '—'} / ${primaryCluster.nodeCount ?? '—'}`} /><Metric label="WORKLOADS" value={primaryCluster.workloadCount ?? '—'} /><Metric label="ALERTS" value={overview.alerts.length} /></div><div className="metric-grid"><Metric label="CPU" value={primaryCluster.cpuUsedCores?.toFixed(1) ?? '—'} unit={primaryCluster.cpuCapacityCores === null ? '' : ` / ${primaryCluster.cpuCapacityCores.toFixed(1)} cores`} /><Metric label="MEM" value={primaryCluster.memoryUsedBytes === null ? '—' : `${(primaryCluster.memoryUsedBytes / (1024 ** 3)).toFixed(1)} GiB`} unit={primaryCluster.memoryCapacityBytes === null ? '' : ` / ${(primaryCluster.memoryCapacityBytes / (1024 ** 3)).toFixed(1)} GiB`} /></div></Panel>
            <Panel className="workload-box" title="OKD" eyebrow="WORKLOAD / FUTURE" severity={futureOkd.metadata.severity} freshness={futureOkd.metadata.freshness}><div className="placeholder-state"><strong>NOT PROVISIONED</strong><span>Reserved for the compact OKD cluster.</span></div></Panel>
            <Panel title="Portland weather" eyebrow="UTILITY / 97209" severity={overview.weather.metadata.severity} freshness={overview.weather.metadata.freshness}><div className="weather-readout"><strong>{overview.weather.temperatureFahrenheit}°F</strong><span>{overview.weather.condition}</span></div><div className="metric-grid"><Metric label="AQI" value={overview.weather.usAqi} detail="U.S. AQI" /><Metric label="PM2.5" value={overview.weather.pm25} unit="µg/m³" /><Metric label="SUNSET" value={overview.weather.sunset?.slice(11, 16) ?? '—'} unit="PT" /></div></Panel>
          </div>
        </div>
        <ComponentGallery />
      </main>
    </>
  );
}
