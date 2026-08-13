import React from 'react';
import type { Host, TimeSeries } from '../shared/contracts.js';
import { HostTelemetryPanel } from './proxmox.js';

function okdNodeConsoleHref(node: Host) {
  const fqdn = `${node.name}.okd.lab.seandre.dev`;
  return `https://console-openshift-console.apps.okd.lab.seandre.dev/k8s/cluster/nodes/${fqdn}`;
}

export function OkdNodePanel({ node, expanded, onExpand, timeSeries = [] }: { node: Host; expanded: boolean; onExpand: () => void; timeSeries?: TimeSeries[] }) {
  return <HostTelemetryPanel host={node} expanded={expanded} onExpand={onExpand} timeSeries={timeSeries} eyebrow="CPU / OKD" href={okdNodeConsoleHref(node)} cardClassName="okd-node-card" />;
}
