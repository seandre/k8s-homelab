import { describe, expect, it } from 'vitest';
import { OKD_MONITORING_QUERIES, OkdMonitoringAdapter } from './okd-monitoring.js';

function response(query: string) {
  const loads: Record<string, number[]> = {
    [OKD_MONITORING_QUERIES.load1]: [0.62, 0.84, 0.45],
    [OKD_MONITORING_QUERIES.load5]: [0.58, 0.75, 0.41],
    [OKD_MONITORING_QUERIES.load15]: [0.51, 0.69, 0.39],
  };
  if (query === OKD_MONITORING_QUERIES.cores) {
    return ['okd-cp-01', 'okd-cp-02', 'okd-cp-03'].flatMap((instance, nodeIndex) => Array.from({ length: 12 }, (_, cpu) => ({ metric: { nodename: `${instance}.okd.lab.seandre.dev`, cpu: String(cpu) }, value: [0, String(5 + nodeIndex + cpu)] })));
  }
  return (loads[query] ?? []).map((value, index) => ({ metric: { nodename: `okd-cp-0${index + 1}.okd.lab.seandre.dev` }, value: [0, String(value)] }));
}

describe('OKD monitoring adapter', () => {
  it('uses only its fixed query catalog and normalizes load and per-core values', async () => {
    const queries: string[] = [];
    const snapshot = await new OkdMonitoringAdapter().read(async (url) => {
      const query = new URL(url).searchParams.get('query') ?? '';
      queries.push(query);
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: response(query) } }) };
    });
    expect(queries).toEqual(Object.values(OKD_MONITORING_QUERIES));
    expect(snapshot.value?.get('okd-cp-01')).toMatchObject({ loadAverage: [0.62, 0.58, 0.51], cpuCorePercentages: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] });
    expect(snapshot.metadata).toMatchObject({ source: 'okd-thanos', freshness: 'CURRENT', severity: 'OK' });
  });

  it('retains no upstream errors or raw objects on authentication failure', async () => {
    const snapshot = await new OkdMonitoringAdapter().read(async () => { throw new Error('403 token=do-not-leak'); });
    expect(snapshot).toMatchObject({ value: null, metadata: { freshness: 'NO_DATA', severity: 'INFO' } });
    expect(JSON.stringify(snapshot)).not.toContain('do-not-leak');
  });
});
