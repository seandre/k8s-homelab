import React from 'react';
import type { Host, TimeSeries } from '../shared/contracts.js';
import { DotGraph, Panel } from './components.js';
import { bytesToGiB } from './overview.js';

function nodeState(node: Host) {
  if (node.kind === 'OKD_NODE') return node.metadata.message === 'Node is not Ready.' ? 'NOT READY' : 'READY';
  return node.metadata.severity === 'CRIT' ? 'NOT READY' : node.metadata.severity === 'WARN' ? 'PRESSURE' : 'READY';
}

function seriesValues(series: TimeSeries[], metric: string, current: number | null) {
  return series.find((entry) => entry.metric === metric)?.points.map((point) => point.value) ?? (current === null ? [] : [current]);
}

function sampleCount(series: TimeSeries[], metric: string) {
  return series.find((entry) => entry.metric === metric)?.points.length ?? 0;
}

function okdNodeConsoleHref(node: Host) {
  const fqdn = `${node.name}.okd.lab.seandre.dev`;
  return `https://console-openshift-console.apps.okd.lab.seandre.dev/k8s/cluster/nodes/${fqdn}`;
}

export function OkdNodePanel({ node, timeSeries = [] }: { node: Host; timeSeries?: TimeSeries[] }) {
  const cpuHistory = seriesValues(timeSeries, `${node.name} CPU`, node.cpuPercent);
  const memoryHistory = seriesValues(timeSeries, `${node.name} MEMORY`, node.memoryPercent);
  const availableMemory = node.memoryTotalBytes === null || node.memoryUsedBytes === null
    ? null
    : Math.max(0, node.memoryTotalBytes - node.memoryUsedBytes);
  const state = nodeState(node);

  return (
    <Panel
      className="cpu-box pve-card okd-node-card"
      title={node.name}
      eyebrow="CPU / OKD"
      severity={node.metadata.severity}
      freshness={node.metadata.freshness}
      href={okdNodeConsoleHref(node)}
    >
      <div className="pve-cpu-region">
        <DotGraph label="CPU" values={cpuHistory} unit="%" tone="cpu" height={8} />
        <div className="pve-cpu-summary">
          <strong>SCHEDULABLE CONTROL PLANE</strong>
          <span>STATUS <b>{state}</b></span>
          <span>CPU <b>{node.cpuPercent ?? '—'}%</b></span>
          <span>MEM <b>{node.memoryPercent ?? '—'}%</b></span>
          <span>ROLE <b>MASTER / WORKER</b></span>
        </div>
      </div>
      <div className="pve-resource-grid">
        <section className="pve-resource memory-resource">
          <h3>MEMORY</h3>
          <DotGraph label="USED" values={memoryHistory} unit="%" tone="memory" height={4} />
          <p><b>{bytesToGiB(node.memoryUsedBytes)} GiB</b> used / {bytesToGiB(node.memoryTotalBytes)} GiB</p>
          <p>{bytesToGiB(availableMemory)} GiB available</p>
        </section>
        <section className="pve-resource okd-health-resource">
          <h3>HEALTH</h3>
          <p>READINESS <b>{state === 'READY' ? 'PASSING' : 'FAILING'}</b></p>
          <p>SEVERITY <b>{node.metadata.severity}</b></p>
          <p>FRESHNESS <b>{node.metadata.freshness.replace('_', ' ')}</b></p>
        </section>
        <section className="pve-resource okd-history-resource">
          <h3>HISTORY</h3>
          <p>CPU SAMPLES <b>{sampleCount(timeSeries, `${node.name} CPU`)}</b></p>
          <p>MEMORY SAMPLES <b>{sampleCount(timeSeries, `${node.name} MEMORY`)}</b></p>
          <p>SOURCE <b>OKD API</b></p>
        </section>
      </div>
    </Panel>
  );
}
