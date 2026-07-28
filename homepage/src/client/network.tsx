import React from 'react';
import { DotGraph, FreshnessLabel, Metric, MirroredTrafficGraph, Panel, StateBadge } from './components.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { buildOverviewModel } from './overview.js';
import type { Bootstrap } from '../shared/contracts.js';

export function NetworkScreen({ bootstrap = healthyBootstrapFixture }: { bootstrap?: Bootstrap }) {
  const model = buildOverviewModel(bootstrap);
  const network = model.network;
  const pveRx = bootstrap.timeSeries.find((series) => series.metric === 'pve-01 RX')?.points.map((point) => point.value) ?? [];
  const pveTx = bootstrap.timeSeries.find((series) => series.metric === 'pve-01 TX')?.points.map((point) => point.value) ?? [];
  const plannedOkd = model.services.filter((service) => service.metadata.freshness === 'NOT_PROVISIONED');
  return (
    <main className="dashboard" id="network">
      <section className="hero-row"><div><span className="panel-eyebrow">NETWORK / READ-ONLY TELEMETRY</span><h1>Reachability and throughput</h1></div><div className="hero-state"><StateBadge severity={network.metadata.severity} label={network.metadata.severity} /><FreshnessLabel freshness={network.metadata.freshness} /></div></section>
      <div className="network-overview" id="network-overview">
        <Panel className="network-box network-latency" title="Latency" eyebrow="READ-ONLY PROBES" severity={network.metadata.severity} freshness={network.metadata.freshness}><div className="metric-grid"><Metric label={`GATEWAY / ${network.gatewayLatencyProtocol ?? '—'}`} value={network.gatewayLatencyMs ?? '—'} unit="ms" detail="local gateway probe" /><Metric label={`INTERNET / ${network.internetLatencyProtocol ?? '—'}`} value={network.internetLatencyMs ?? '—'} unit="ms" detail="public HTTPS probe" /></div><div className="resource-graphs"><DotGraph label="GATEWAY" values={[]} unit="ms" tone="download" /><DotGraph label="INTERNET" values={[]} unit="ms" tone="upload" /></div></Panel>
        <Panel className="network-box network-throughput" title="Throughput" eyebrow="PVE-01 / GLANCES" severity="OK" freshness="CURRENT"><MirroredTrafficGraph upload={pveTx} download={pveRx} unit="Mb/s" /><span className="metric-detail">Host bridge traffic; download grows above the midline and upload grows below it.</span></Panel>
        <Panel className="network-box network-ingress" title="Ingress VIPs" eyebrow="PRIVATE SPLIT DNS" severity="OK"><div className="vip-list">{network.ingressVips.map((vip, index) => <span key={vip}><b>{vip}</b><small>{index === 0 ? 'k3s ingress' : 'future OKD API'}</small></span>)}</div></Panel>
        <Panel className="network-box network-unifi" title="PDU Pro" eyebrow="POWER / UNPOLLER" severity={network.pduPower.metadata.severity} freshness={network.pduPower.metadata.freshness}>{network.pduPower.totalWatts === null ? <div className="placeholder-state"><strong>{network.pduPower.metadata.freshness.replace('_', ' ')}</strong><span>{network.pduPower.metadata.message}</span></div> : <div className="metric-grid"><Metric label="TOTAL DRAW" value={network.pduPower.totalWatts} unit="W" detail="PVE outlet values are shown on their host cards." /><a className="open-link" href="/compute">View PVE outlet draw →</a></div>}</Panel>
        <Panel className="network-box network-speedtest" title="Last speed test" eyebrow="HISTORICAL / READ-ONLY" severity={network.lastSpeedTest.metadata.severity} freshness={network.lastSpeedTest.metadata.freshness}><div className="metric-grid"><Metric label="DOWNLOAD" value={network.lastSpeedTest.downloadMbps ?? '—'} unit="Mb/s" /><Metric label="UPLOAD" value={network.lastSpeedTest.uploadMbps ?? '—'} unit="Mb/s" /><Metric label="LATENCY" value={network.lastSpeedTest.latencyMs ?? '—'} unit="ms" /></div><p className="network-note">Observed {network.lastSpeedTest.observedAt?.slice(11, 16) ?? '—'} UTC. Results are displayed only; this application cannot start a test.</p></Panel>
        <Panel className="network-box network-planned" title="Planned OKD endpoints" eyebrow="FUTURE / NEUTRAL" severity="INFO" freshness="NOT_PROVISIONED"><div className="service-list">{plannedOkd.map((service) => <span className="planned-endpoint" key={service.id}><strong>{service.name}</strong><small>{service.href}</small><StateBadge severity="INFO" label="NOT PROVISIONED" /></span>)}</div></Panel>
      </div>
      <section className="network-fixture-states" aria-labelledby="network-fixture-states-title"><div className="section-heading"><span className="panel-eyebrow">STATE COVERAGE</span><h2 id="network-fixture-states-title">Partial and unavailable sources</h2></div><div className="compute-node-grid"><Panel title="Stale history" eyebrow="SPEED TEST" severity="INFO" freshness="STALE"><div className="empty-state">Last known result remains visible with its age.</div></Panel><Panel title="No latency sample" eyebrow="PROBE" severity="INFO" freshness="NO_DATA"><div className="empty-state">No successful sample; no value is inferred.</div></Panel><Panel title="Partial source" eyebrow="UNIFI" severity="INFO" freshness="NOT_SUPPORTED"><div className="empty-state">Unsupported controller capability stays distinct from reachability.</div></Panel></div></section>
    </main>
  );
}
