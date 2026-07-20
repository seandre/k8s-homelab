import { z } from 'zod';
import type { Alert, SourceMetadata } from '../shared/contracts.js';
import { SourceNormalizer, withTimeout, type Clock } from './normalization.js';

const AlertsSchema = z.array(z.object({
  fingerprint: z.string().min(1),
  startsAt: z.string().datetime({ offset: true }),
  status: z.object({ state: z.string() }),
  labels: z.record(z.string(), z.string()),
  annotations: z.record(z.string(), z.string()).optional(),
}));

export interface AlertmanagerFetchResponse { ok: boolean; json(): Promise<unknown>; }
export type AlertmanagerFetch = (url: string) => Promise<AlertmanagerFetchResponse>;

function severity(labels: Record<string, string>): Alert['severity'] {
  const value = (labels.severity ?? '').toLowerCase();
  if (/critical|page|fatal/.test(value)) return 'CRIT';
  if (/warning|warn/.test(value)) return 'WARN';
  return 'INFO';
}

export class AlertmanagerAdapter {
  private readonly normalizer: SourceNormalizer<z.infer<typeof AlertsSchema>>;

  constructor(private readonly server: string, enabled: boolean, clock?: Clock) {
    this.normalizer = new SourceNormalizer({ source: 'alertmanager-api', staleAfterMs: 45_000, unsupported: !enabled, ...(clock ? { clock } : {}) });
  }

  async read(fetcher: AlertmanagerFetch): Promise<Alert[]> {
    if (this.normalizer.canAttempt()) {
      try {
        const response = await withTimeout(fetcher(`${this.server.replace(/\/$/, '')}/api/v2/alerts`), 3_000);
        if (!response.ok) throw new Error('Alertmanager request failed.');
        this.normalizer.recordSuccess(AlertsSchema.parse(await response.json()));
      } catch { this.normalizer.recordFailure(); }
    }
    const snapshot = this.normalizer.snapshot();
    if (!snapshot.value) return [];
    return snapshot.value
      .filter((alert) => alert.status.state.toLowerCase() === 'active' && alert.labels.alertname !== 'Watchdog')
      .map((alert) => {
        const alertSeverity = severity(alert.labels);
        const metadata: SourceMetadata = { ...snapshot.metadata, severity: alertSeverity };
        return {
          id: alert.fingerprint,
          name: alert.labels.alertname ?? 'Unnamed alert',
          severity: alertSeverity,
          summary: alert.annotations?.summary ?? alert.annotations?.description ?? 'Alertmanager reported an active alert.',
          startsAt: alert.startsAt,
          source: 'alertmanager',
          metadata,
        };
      });
  }
}
