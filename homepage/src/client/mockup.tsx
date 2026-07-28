import React from 'react';
import { useState } from 'react';
import { Metric, Panel, StateBadge } from './components.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { buildOverviewModel } from './overview.js';
import { ProxmoxPanel } from './proxmox.js';
import type { Bootstrap } from '../shared/contracts.js';
import { IndoorOverviewCard } from './indoor.js';

function oneDecimal(value: number | null) { return value === null ? '—' : value.toFixed(1); }

export function OverviewScreen({ bootstrap = healthyBootstrapFixture }: { bootstrap?: Bootstrap }) {
  const [expandedHosts, setExpandedHosts] = useState<string[]>([]);
  const toggleExpandedHost = (hostId: string) => setExpandedHosts((current) => current.includes(hostId) ? current.filter((id) => id !== hostId) : [...current, hostId]);
  const data = bootstrap;
  const overview = buildOverviewModel(data);
  const primaryCluster = overview.k3s!;
  const alert = overview.alerts[0];
  return (
    <>
      <main className="dashboard" id="overview">
        <section className="hero-row"><div><span className="panel-eyebrow">OVERVIEW / READ-ONLY TELEMETRY</span><h1>Operations at a glance</h1></div><div className="hero-state"><span>Last refresh {data.generatedAt.slice(11, 19)} UTC</span></div></section>
        {alert ? <section className="alert-strip" id="overview-alerts" aria-label="Active alerts"><StateBadge severity={alert.severity} /><strong>{overview.alerts.length} active alert{overview.alerts.length === 1 ? '' : 's'}</strong><span>{alert.summary}</span><a href="/kubernetes">View Kubernetes ↗</a></section> : null}
        <div className="pve-overview">
          {overview.proxmoxHosts.map((host) => <ProxmoxPanel key={host.id} host={host} timeSeries={data.timeSeries} expanded={expandedHosts.includes(host.id)} onExpand={() => toggleExpandedHost(host.id)} />)}
          <div className="overview-summary-grid">
            <IndoorOverviewCard indoor={data.indoor} />
            <Panel className="overview-summary-card" title="UDM Pro" eyebrow="NETWORK / UNPOLLER" severity={overview.network.udm.metadata.severity} freshness={overview.network.udm.metadata.freshness} href="https://unifi.ui.com"><div className="metric-grid"><Metric label="STATUS" value={overview.network.unifi.status ?? '—'} /><Metric label="WAN LATENCY" value={overview.network.udm.latencyMs === null ? '—' : Math.round(overview.network.udm.latencyMs)} unit="ms" /><Metric label="CLIENTS" value={overview.network.udm.clientCount ?? '—'} /><Metric label="DOWNLOAD" value={oneDecimal(overview.network.udm.wanDownloadMbps)} unit="Mb/s" /><Metric label="UPLOAD" value={oneDecimal(overview.network.udm.wanUploadMbps)} unit="Mb/s" /></div></Panel>
            <Panel className="overview-summary-card" title="Kubernetes" eyebrow="WORKLOAD / k3s" severity={primaryCluster.metadata.severity} freshness={primaryCluster.metadata.freshness} href="https://argocd.lab.seandre.dev"><div className="metric-grid"><Metric label="HEALTH" value={primaryCluster.metadata.severity} /><Metric label="NODES" value={`${primaryCluster.readyNodeCount ?? '—'} / ${primaryCluster.nodeCount ?? '—'}`} /><Metric label="WORKLOADS" value={primaryCluster.workloadCount ?? '—'} /><Metric label="ALERTS" value={overview.alerts.length} /></div></Panel>
            <Panel className="overview-summary-card" title="Weather" eyebrow="PORTLAND / 97209" severity={overview.weather.metadata.severity} freshness={overview.weather.metadata.freshness}><div className="weather-readout"><strong>{overview.weather.temperatureFahrenheit ?? '—'}°F</strong><span>{overview.weather.condition ?? '—'}</span></div><div className="metric-grid"><Metric label="AQI" value={overview.weather.usAqi ?? '—'} /><Metric label="PM2.5" value={overview.weather.pm25 ?? '—'} unit="µg/m³" /><Metric label="SUNSET" value={overview.weather.sunset?.slice(11, 16) ?? '—'} unit="PT" /></div></Panel>
          </div>
        </div>
      </main>
    </>
  );
}
