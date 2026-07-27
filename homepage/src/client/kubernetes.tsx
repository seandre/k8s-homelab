import React from 'react';
import { DotGraph, Metric, Panel } from './components.js';
import { bytesToGiB, buildOverviewModel } from './overview.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import type { Bootstrap, Host, TimeSeries } from '../shared/contracts.js';

function nodeState(node: { metadata: { severity: string } }) {
  return node.metadata.severity === 'WARN' ? 'PRESSURE' : 'READY';
}

function seriesValues(series: TimeSeries[], metric: string, current: number | null) {
  return series.find((entry) => entry.metric === metric)?.points.map((point) => point.value) ?? (current === null ? [] : [current]);
}

function utilization(used: number | null, capacity: number | null) {
  return used === null || capacity === null || capacity <= 0 ? null : (used / capacity) * 100;
}

function KubernetesNodeGraphs({ node, timeSeries }: { node: Host; timeSeries: TimeSeries[] }) {
  const diskHistory = timeSeries.some((series) => series.metric === `${node.name} DISK`);
  const rxHistory = timeSeries.some((series) => series.metric === `${node.name} RX`);
  const txHistory = timeSeries.some((series) => series.metric === `${node.name} TX`);
  return <div className="k8s-graph-grid k8s-node-graph-grid">
    <DotGraph label="CPU" values={seriesValues(timeSeries, `${node.name} CPU`, node.cpuPercent)} unit="%" tone="cpu" height={4} width={28} />
    <DotGraph label="MEMORY" values={seriesValues(timeSeries, `${node.name} MEMORY`, node.memoryPercent)} unit="%" tone="memory" height={4} width={28} />
    {diskHistory ? <DotGraph label="DISK" values={seriesValues(timeSeries, `${node.name} DISK`, node.diskTotalBytes && node.diskUsedBytes !== null ? node.diskUsedBytes / node.diskTotalBytes * 100 : null)} unit="%" tone="disk" height={4} width={28} /> : null}
    {rxHistory || txHistory ? <div className="k8s-network-graphs">{rxHistory ? <DotGraph label="DOWN" values={seriesValues(timeSeries, `${node.name} RX`, node.networkIngressBitsPerSecond === null ? null : node.networkIngressBitsPerSecond / 1_000_000)} unit="Mb/s" tone="download" height={2} width={28} /> : null}{txHistory ? <DotGraph label="UP" values={seriesValues(timeSeries, `${node.name} TX`, node.networkEgressBitsPerSecond === null ? null : node.networkEgressBitsPerSecond / 1_000_000)} unit="Mb/s" tone="upload" height={2} width={28} /> : null}</div> : null}
  </div>;
}

function CapacityGraphs({ cluster, timeSeries }: { cluster: NonNullable<ReturnType<typeof buildOverviewModel>['k3s']>; timeSeries: TimeSeries[] }) {
  return <div className="k8s-graph-grid">
    <DotGraph label="CPU" values={seriesValues(timeSeries, 'k3s CPU', utilization(cluster.cpuUsedCores, cluster.cpuCapacityCores))} unit="%" tone="cpu" height={4} width={28} />
    <DotGraph label="MEMORY" values={seriesValues(timeSeries, 'k3s MEMORY', utilization(cluster.memoryUsedBytes, cluster.memoryCapacityBytes))} unit="%" tone="memory" height={4} width={28} />
  </div>;
}

export function KubernetesScreen({ bootstrap = healthyBootstrapFixture }: { bootstrap?: Bootstrap }) {
  const model = buildOverviewModel(bootstrap);
  const cluster = model.k3s!;
  const unhealthy = model.workloads.filter((workload) => workload.clusterId === cluster.id && workload.metadata.severity !== 'OK');

  return <main className="dashboard" id="kubernetes">
    <section className="hero-row"><div><span className="panel-eyebrow">KUBERNETES / READ-ONLY TELEMETRY</span><h1>{cluster.name} workload health</h1></div></section>
    <section className="cluster-summary-grid" id="cluster-summary" aria-label="k3s capacity summary">
      <Panel title="Control plane" eyebrow="K3S" severity={cluster.metadata.severity} freshness={cluster.metadata.freshness}><div className="metric-grid"><Metric label="NODES READY" value={`${cluster.readyNodeCount ?? '—'} / ${cluster.nodeCount ?? '—'}`} /><Metric label="WORKLOADS" value={cluster.workloadCount ?? '—'} /></div></Panel>
      <Panel title="Capacity" eyebrow="SCHEDULABLE" severity="OK" freshness={cluster.metadata.freshness}><div className="metric-grid"><Metric label="CPU" value={cluster.cpuUsedCores?.toFixed(1) ?? '—'} unit={` / ${cluster.cpuCapacityCores ?? '—'} cores`} /><Metric label="MEMORY" value={bytesToGiB(cluster.memoryUsedBytes)} unit={` / ${bytesToGiB(cluster.memoryCapacityBytes)} GiB`} /></div><CapacityGraphs cluster={cluster} timeSeries={bootstrap.timeSeries} /></Panel>
    </section>
    <section className="compute-section" aria-labelledby="k3s-health-title"><div className="section-heading"><span className="panel-eyebrow">NODE HEALTH</span><h2 id="k3s-health-title">Control plane and workers</h2></div><div className="compute-node-grid">{model.k3sNodes.map((node) => <Panel className="workload-box" key={node.id} title={node.name} eyebrow={node.id.includes('control') ? 'CONTROL PLANE' : 'WORKER'} severity={node.metadata.severity} freshness={node.metadata.freshness}><div className="metric-grid"><Metric label="CPU" value={node.cpuPercent ?? '—'} unit="%" /><Metric label="MEMORY" value={node.memoryPercent ?? '—'} unit="%" /><Metric label="STATUS" value={nodeState(node)} /></div><KubernetesNodeGraphs node={node} timeSeries={bootstrap.timeSeries} /></Panel>)}</div></section>
    <section className="compute-section" aria-labelledby="k3s-workload-title"><div className="section-heading"><span className="panel-eyebrow">ATTENTION</span><h2 id="k3s-workload-title">Unhealthy workloads</h2></div>{unhealthy.length ? <div className="workload-list">{unhealthy.map((workload) => <Panel key={workload.id} title={workload.name} eyebrow={workload.namespace} severity={workload.metadata.severity} freshness={workload.metadata.freshness} {...(workload.href ? { href: workload.href } : {})}><div className="metric-grid"><Metric label="READY" value={`${workload.readyReplicas ?? '—'} / ${workload.desiredReplicas ?? '—'}`} /><Metric label="DETAIL" value={workload.metadata.message ?? 'Requires attention'} /></div></Panel>)}</div> : <div className="empty-state">No unhealthy workloads currently reported.</div>}</section>
  </main>;
}

export function OkdScreen({ bootstrap = healthyBootstrapFixture }: { bootstrap?: Bootstrap }) {
  const model = buildOverviewModel(bootstrap);
  const cluster = model.futureOkd!;
  return <main className="dashboard" id="okd">
    <section className="hero-row"><div><span className="panel-eyebrow">OKD / FUTURE FIXTURE</span><h1>OKD</h1></div></section>
    <Panel title="Cluster aggregate" eyebrow="PLANNED PLATFORM" severity={cluster.metadata.severity} freshness={cluster.metadata.freshness}><div className="placeholder-state"><strong>NOT PROVISIONED</strong><span>{cluster.metadata.message}</span></div></Panel>
    <section className="compute-section" aria-labelledby="okd-future-nodes"><div className="section-heading"><span className="panel-eyebrow">RESERVED TOPOLOGY</span><h2 id="okd-future-nodes">Future control-plane nodes</h2></div><div className="compute-node-grid">{model.futureOkdNodes.map((node) => <Panel className="workload-box" key={node.id} title={node.name} eyebrow="OKD CONTROL PLANE" severity={node.metadata.severity} freshness={node.metadata.freshness}><div className="placeholder-state"><strong>NOT PROVISIONED</strong><span>{node.metadata.message}</span></div></Panel>)}</div></section>
  </main>;
}
