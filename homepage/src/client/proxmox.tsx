import React from 'react';
import type { Host, TimeSeries } from '../shared/contracts.js';
import { DotGraph, Metric, Panel } from './components.js';
import { toBrailleGraphRows } from './graph.js';
import { bytesToGiB, bytesToTiB } from './overview.js';

function uptimeLabel(seconds: number | null) {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 86_400)}d`;
}

function byteCountLabel(bytes: number | null) {
  if (bytes === null) return 'N/S';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unitIndex = Math.min(Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** unitIndex)).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function CoreMonitor({ hostName, cores, timeSeries }: { hostName: string; cores: number[] | null; timeSeries: TimeSeries[] }) {
  if (cores === null) return <div className="proxmox-core-monitor core-monitor-unsupported"><span>PER-CORE</span><strong>NOT SUPPORTED</strong></div>;
  const midpoint = Math.ceil(cores.length / 2);
  const columns = [cores.slice(0, midpoint), cores.slice(midpoint)];
  return (
    <section className="proxmox-core-monitor" aria-label="Per-core CPU utilization">
      <span className="sr-only">PER-CORE</span>
      <div className="core-columns">
        {columns.map((column, columnIndex) => <div className="core-column" key={columnIndex}>{column.map((value, rowIndex) => {
          const coreIndex = rowIndex + (columnIndex * midpoint);
          const values = seriesValues(timeSeries, `${hostName} CORE ${coreIndex}`, value);
          const trace = toBrailleGraphRows(values, 16, 1)[0] ?? '\u2800'.repeat(16);
          return <div className="core-meter" aria-label={`Core ${coreIndex}: ${value} percent; ${values.length} historical samples`} key={coreIndex}><strong>C{coreIndex}</strong><span className="core-history" aria-hidden="true">{trace}</span><b>{value}%</b></div>;
        })}</div>)}
      </div>
    </section>
  );
}

function ProxmoxDetail({ host, timeSeries }: { host: Host; timeSeries: TimeSeries[] }) {
  return (
    <div className="proxmox-detail">
      <div className="proxmox-detail-heading"><span>HOST DRILL-DOWN</span></div>
      <div className="metric-grid proxmox-detail-grid">
        <Metric label="CPU CLOCK" value={host.cpuClockMhz === null ? 'N/S' : (host.cpuClockMhz / 1_000).toFixed(1)} unit={host.cpuClockMhz === null ? '' : 'GHz'} detail={host.cpuClockMhz === null ? 'NOT SUPPORTED' : 'current clock'} />
        <Metric label="LOAD TREND" value={host.loadAverage ? host.loadAverage.slice(1).map((value) => value.toFixed(2)).join(' / ') : 'N/S'} detail={host.loadAverage === null ? 'NOT SUPPORTED' : '5m / 15m'} />
        <Metric label="SWAP" value={host.swapUsedBytes === null ? 'N/S' : bytesToGiB(host.swapUsedBytes)} unit={host.swapUsedBytes === null ? '' : ` GiB / ${bytesToGiB(host.swapTotalBytes)} GiB`} detail={host.swapUsedBytes === null ? 'NOT SUPPORTED' : 'used / installed'} />
        <Metric label="CONTAINERS" value={host.runningContainerCount ?? 'N/S'} detail={`stopped: ${host.stoppedContainerCount ?? 'N/S'}`} />
        <Metric label="VIRTUAL MACHINES" value={host.runningVmCount ?? 'N/S'} detail={`stopped: ${host.stoppedVmCount ?? 'N/S'}`} />
      </div>
      <CoreMonitor hostName={host.name} cores={host.cpuCorePercentages} timeSeries={timeSeries} />
    </div>
  );
}

function seriesValues(series: TimeSeries[], metric: string, current: number | null) { return series.find((entry) => entry.metric === metric)?.points.map((point) => point.value) ?? (current === null ? [] : [current]); }

export function ProxmoxPanel({ host, expanded, onExpand, timeSeries = [] }: { host: Host; expanded: boolean; onExpand: () => void; timeSeries?: TimeSeries[] }) {
  const cpu = host.cpuPercent;
  const memory = host.memoryPercent;
  const download = host.networkIngressBitsPerSecond === null ? null : Math.round(host.networkIngressBitsPerSecond / 1_000_000);
  const upload = host.networkEgressBitsPerSecond === null ? null : Math.round(host.networkEgressBitsPerSecond / 1_000_000);
  const downloadHistory = seriesValues(timeSeries, `${host.name} RX`, download);
  const uploadHistory = seriesValues(timeSeries, `${host.name} TX`, upload);
  const maxDownload = downloadHistory.length === 0 ? null : Math.round(Math.max(...downloadHistory));
  const maxUpload = uploadHistory.length === 0 ? null : Math.round(Math.max(...uploadHistory));
  const disk = host.diskTotalBytes === null || host.diskUsedBytes === null ? null : Math.round(host.diskUsedBytes / host.diskTotalBytes * 100);
  return (
    <Panel className="cpu-box pve-card" title={host.name} eyebrow="CPU / PROXMOX" severity={host.metadata.severity} freshness={host.metadata.freshness} href={`https://${host.name}.lab.seandre.dev:8006`} expanded={expanded} onExpand={onExpand}>
      <div className="pve-cpu-region">
        <DotGraph label="CPU" values={seriesValues(timeSeries, `${host.name} CPU`, cpu)} unit="%" tone="cpu" height={8} width={52} />
        <div className="pve-cpu-summary"><strong>{host.cpuModel ?? 'CPU MODEL N/S'}</strong><span>TEMP <b>{host.temperatureCelsius ?? '—'}°C</b></span><span>LOAD <b>{host.loadAverage?.[0].toFixed(2) ?? 'N/S'}</b></span><span>PWR <b>{host.powerWatts === null ? 'N/S' : Math.round(host.powerWatts)}{host.powerWatts === null ? '' : ' W'}</b></span><span>UP <b>{uptimeLabel(host.uptimeSeconds)}</b></span></div>
      </div>
      <div className="pve-resource-grid">
        <section className="pve-resource memory-resource"><h3>MEMORY</h3><DotGraph label="USED" values={seriesValues(timeSeries, `${host.name} MEMORY`, memory)} unit="%" tone="memory" height={2} width={20} /><p><b>{bytesToGiB(host.memoryUsedBytes)} GiB</b> used / {bytesToGiB(host.memoryTotalBytes)} GiB</p><p>{host.memoryTotalBytes === null || host.memoryUsedBytes === null ? '—' : bytesToGiB(host.memoryTotalBytes - host.memoryUsedBytes)} GiB available</p></section>
        <section className="pve-resource disk-resource"><h3>DISKS</h3><DotGraph label="VM DATA" values={seriesValues(timeSeries, `${host.name} DISK`, disk)} unit="%" tone="disk" height={2} width={20} /><p><b>{bytesToTiB(host.diskUsedBytes)} TiB</b> used / {bytesToTiB(host.diskTotalBytes)} TiB</p><p>I/O WAIT <b>{host.diskIoPercent ?? '—'}%</b></p></section>
        <section className="pve-resource network-resource"><h3>NETWORK</h3><DotGraph label="DOWN" values={downloadHistory} unit="Mb/s" tone="download" height={1} width={20} /><DotGraph label="UP" values={uploadHistory} unit="Mb/s" tone="upload" height={1} width={20} /><p>MAX RX <b>{maxDownload ?? 'N/S'}{maxDownload === null ? '' : ' Mb/s'}</b> · MAX TX <b>{maxUpload ?? 'N/S'}{maxUpload === null ? '' : ' Mb/s'}</b></p><p>TOTAL TRANSFER <b>{byteCountLabel(host.networkTotalBytes)}</b></p></section>
      </div>
      {expanded ? <ProxmoxDetail host={host} timeSeries={timeSeries} /> : null}
    </Panel>
  );
}
