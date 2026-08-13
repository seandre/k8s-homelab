import { describe, expect, it } from 'vitest';
import { OKD_MONITORING_QUERIES, OkdMonitoringAdapter } from './okd-monitoring.js';

function response(query: string) {
  const values: Record<string, number[]> = {
    [OKD_MONITORING_QUERIES.load1]: [0.62, 0.84, 0.45],
    [OKD_MONITORING_QUERIES.load5]: [0.58, 0.75, 0.41],
    [OKD_MONITORING_QUERIES.load15]: [0.51, 0.69, 0.39],
    [OKD_MONITORING_QUERIES.diskTotal]: [999_178_825_728, 999_178_825_728, 999_178_825_728],
    [OKD_MONITORING_QUERIES.diskAvailable]: [962_015_649_792, 947_853_389_824, 950_501_224_448],
    [OKD_MONITORING_QUERIES.diskIo]: [2.58, 2.62, 2.45],
    [OKD_MONITORING_QUERIES.networkIngress]: [1_562_828, 3_861_013, 2_724_760],
    [OKD_MONITORING_QUERIES.networkEgress]: [2_714_027, 2_665_116, 2_817_471],
    [OKD_MONITORING_QUERIES.networkTotal]: [160_578_052_807, 250_006_355_421, 198_545_040_757],
    [OKD_MONITORING_QUERIES.swapTotal]: [0, 0, 0],
    [OKD_MONITORING_QUERIES.swapFree]: [0, 0, 0],
    [OKD_MONITORING_QUERIES.temperature]: [45.375, 55.875, 55.875],
    [OKD_MONITORING_QUERIES.uptime]: [161_353, 164_717, 163_143],
    [OKD_MONITORING_QUERIES.runningContainers]: [64, 132, 106],
    [OKD_MONITORING_QUERIES.stoppedContainers]: [42, 88, 44],
  };
  if (query === OKD_MONITORING_QUERIES.cores) {
    return ['okd-cp-01', 'okd-cp-02', 'okd-cp-03'].flatMap((instance, nodeIndex) => Array.from({ length: 12 }, (_, cpu) => ({ metric: { nodename: `${instance}.okd.lab.seandre.dev`, cpu: String(cpu) }, value: [0, String(5 + nodeIndex + cpu)] })));
  }
  return (values[query] ?? []).map((value, index) => ({ metric: query === OKD_MONITORING_QUERIES.runningContainers || query === OKD_MONITORING_QUERIES.stoppedContainers ? { node: `okd-cp-0${index + 1}.okd.lab.seandre.dev` } : { nodename: `okd-cp-0${index + 1}.okd.lab.seandre.dev` }, value: [0, String(value)] }));
}

describe('OKD monitoring adapter', () => {
  it('uses only its fixed query catalog and normalizes supported host telemetry', async () => {
    const queries: string[] = [];
    const snapshot = await new OkdMonitoringAdapter().read(async (url) => {
      const query = new URL(url).searchParams.get('query') ?? '';
      queries.push(query);
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: response(query) } }) };
    });
    expect(queries).toEqual(Object.values(OKD_MONITORING_QUERIES));
    expect(queries).toHaveLength(16);
    expect(OKD_MONITORING_QUERIES.load1).toContain(String.raw`(\\.okd\\.lab\\.seandre\\.dev)?`);
    expect(snapshot.value?.get('okd-cp-01')).toMatchObject({
      loadAverage: [0.62, 0.58, 0.51],
      cpuCorePercentages: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      diskUsedBytes: 37_163_175_936,
      diskTotalBytes: 999_178_825_728,
      diskIoPercent: 2.6,
      networkIngressBitsPerSecond: 1_562_828,
      networkEgressBitsPerSecond: 2_714_027,
      networkTotalBytes: 160_578_052_807,
      swapUsedBytes: 0,
      swapTotalBytes: 0,
      temperatureCelsius: 45.4,
      uptimeSeconds: 161_353,
      runningContainerCount: 64,
      stoppedContainerCount: 42,
    });
    expect(snapshot.metadata).toMatchObject({ source: 'okd-thanos', freshness: 'CURRENT', severity: 'OK' });
  });

  it('retains no upstream errors or raw objects on authentication failure', async () => {
    const snapshot = await new OkdMonitoringAdapter().read(async () => { throw new Error('403 token=do-not-leak'); });
    expect(snapshot).toMatchObject({ value: null, metadata: { freshness: 'NO_DATA', severity: 'INFO' } });
    expect(JSON.stringify(snapshot)).not.toContain('do-not-leak');
  });
});
