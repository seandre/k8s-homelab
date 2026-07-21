import { useState } from 'react';
import { Metric, Panel } from './components.js';
import { buildOverviewModel } from './overview.js';
import { ProxmoxPanel } from './proxmox.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import type { Bootstrap } from '../shared/contracts.js';

export function ComputeScreen({ bootstrap = healthyBootstrapFixture }: { bootstrap?: Bootstrap }) {
  const [expandedHosts, setExpandedHosts] = useState<string[]>([]);
  const toggleExpandedHost = (hostId: string) => setExpandedHosts((current) => current.includes(hostId) ? current.filter((id) => id !== hostId) : [...current, hostId]);
  const model = buildOverviewModel(bootstrap);
  return (
    <main className="dashboard" id="compute">
      <section className="hero-row"><div><span className="panel-eyebrow">COMPUTE / READ-ONLY TELEMETRY</span><h1>Hosts and clusters</h1></div></section>
      <section className="compute-section" aria-labelledby="proxmox-title"><div className="section-heading"><span className="panel-eyebrow">VIRTUALIZATION</span><h2 id="proxmox-title">Proxmox hosts</h2></div><div className="pve-overview compute-host-grid">{model.proxmoxHosts.map((host) => <ProxmoxPanel key={host.id} host={host} timeSeries={bootstrap.timeSeries} expanded={expandedHosts.includes(host.id)} onExpand={() => toggleExpandedHost(host.id)} />)}</div></section>
      <section className="compute-section" aria-labelledby="k3s-nodes-title"><div className="section-heading"><span className="panel-eyebrow">WORKLOAD / k3s</span><h2 id="k3s-nodes-title">k3s nodes</h2></div><div className="compute-node-grid">{model.k3sNodes.map((node) => <Panel className="workload-box" key={node.id} title={node.name} eyebrow="K3S NODE" severity={node.metadata.severity} freshness={node.metadata.freshness}><div className="metric-grid"><Metric label="CPU" value={node.cpuPercent ?? '—'} unit="%" /><Metric label="MEMORY" value={node.memoryPercent ?? '—'} unit="%" /><Metric label="STATUS" value={node.metadata.severity === 'WARN' ? 'PRESSURE' : 'READY'} /></div></Panel>)}</div></section>
      <section className="compute-section" aria-labelledby="okd-nodes-title"><div className="section-heading"><span className="panel-eyebrow">WORKLOAD / FUTURE</span><h2 id="okd-nodes-title">OKD control-plane nodes</h2></div><div className="compute-node-grid">{model.futureOkdNodes.map((node) => <Panel className="workload-box" key={node.id} title={node.name} eyebrow="OKD CONTROL PLANE" severity={node.metadata.severity} freshness={node.metadata.freshness}><div className="placeholder-state"><strong>NOT PROVISIONED</strong><span>This planned node is neutral and excluded from global severity.</span></div></Panel>)}</div></section>
    </main>
  );
}
