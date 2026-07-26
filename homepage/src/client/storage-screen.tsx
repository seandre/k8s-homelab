import React from 'react';
import { FreshnessLabel, Metric, Panel, StateBadge } from './components.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { bytesToTiB } from './overview.js';
import { storageModel } from './storage.js';
import type { Bootstrap } from '../shared/contracts.js';

function ageLabel(seconds: number | null) {
  if (seconds === null) return 'NO DATA';
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h old`;
  return `${Math.round(seconds / 86_400)}d old`;
}

export function StorageScreen({ bootstrap = healthyBootstrapFixture }: { bootstrap?: Bootstrap }) {
  const model = storageModel(bootstrap);
  return (
    <main className="dashboard" id="storage-backups">
      <section className="hero-row"><div><span className="panel-eyebrow">STORAGE / BACKUPS / FIXTURE MODE</span><h1>Datastores and protection</h1></div></section>
      <div className="storage-summary-grid">
        <Panel id="pbs-status" className="memory-box" title="Proxmox Backup Server" eyebrow="REACHABILITY" severity={model.pbs.metadata.severity} freshness={model.pbs.metadata.freshness}><div className="metric-grid"><Metric label="DATASTORE" value={model.pbs.datastore} /><Metric label="REACHABILITY" value={model.pbs.reachable === true ? 'UP' : model.pbs.reachable === false ? 'DOWN' : '—'} detail="separate from backup state" /></div><p className="network-note">Read-only status only. This view cannot start, restore, prune, verify, or remediate a backup.</p></Panel>
        <Panel className="memory-box" title="Backup policy" eyebrow="FIXTURE THRESHOLDS" severity="INFO"><div className="metric-grid"><Metric label="WARN AGE" value={model.policy.backupWarningAgeSeconds / 3_600} unit="h" /><Metric label="FAILURES" value={model.policy.backupFailureThreshold} unit="job" detail="before failure state" /></div><p className="network-note">Thresholds are fixture-owned, not inferred from the interface.</p></Panel>
      </div>
      <section className="compute-section" aria-labelledby="datastore-title"><div className="section-heading"><span className="panel-eyebrow">DATASTORES / JOBS</span><h2 id="datastore-title">Backup state</h2></div><div className="storage-backup-grid">{model.backups.map(({ backup, state, ageSeconds }) => <Panel className="memory-box" key={backup.id} title={backup.name} eyebrow="PBS DATA" severity={backup.metadata.severity} freshness={backup.metadata.freshness}><div className="metric-grid"><Metric label="USED" value={bytesToTiB(backup.usedBytes)} unit="TiB" detail={`/ ${bytesToTiB(backup.capacityBytes)} TiB`} /><Metric label="AGE" value={ageLabel(ageSeconds)} /><Metric label="FAILURES" value={backup.failureCount ?? '—'} /></div><div className="storage-state"><StateBadge severity={state === 'FAILED' ? 'CRIT' : state === 'OLD' ? 'WARN' : 'INFO'} label={state.replace('_', ' ')} /><FreshnessLabel freshness={backup.metadata.freshness} /></div><p className="network-note">{backup.metadata.message ?? 'Fixture backup record.'}</p></Panel>)}</div></section>
      <section className="network-fixture-states" aria-labelledby="storage-state-coverage"><div className="section-heading"><span className="panel-eyebrow">STATE COVERAGE</span><h2 id="storage-state-coverage">Reachability and data are distinct</h2></div><div className="compute-node-grid"><Panel title="Healthy" eyebrow="BACKUP AGE" severity="OK" freshness="CURRENT"><div className="empty-state">Recent successful backup within the 24-hour policy.</div></Panel><Panel title="Old" eyebrow="BACKUP AGE" severity="WARN" freshness="STALE"><div className="empty-state">Last successful backup exceeds the configured threshold.</div></Panel><Panel title="Failed" eyebrow="JOB RESULT" severity="CRIT" freshness="CURRENT"><div className="empty-state">Failure count is independent of datastore reachability.</div></Panel><Panel title="Unreachable" eyebrow="PBS PROBE" severity="WARN" freshness="NO_DATA"><div className="empty-state">PBS cannot be reached; prior datastore state is not overwritten.</div></Panel><Panel title="No data" eyebrow="ROW APPLICABILITY" severity="INFO" freshness="NO_DATA"><div className="empty-state">This storage row does not have a backup record.</div></Panel></div></section>
    </main>
  );
}
