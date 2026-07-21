import { describe, expect, it } from 'vitest';
import { PrometheusAdapter, buildPduPowerQueries, buildUdmQueries } from './prometheus.js';

describe('Prometheus adapter', () => {
  it('uses its fixed aggregate catalog and returns only normalized values', async () => {
    const urls: string[] = [];
    const adapter = new PrometheusAdapter('http://prometheus.monitoring.svc:9090', true);
    const result = await adapter.readCluster(async (url) => {
      urls.push(url);
      const query = new URL(url).searchParams.get('query');
      const values: Record<string, string> = {
        'sum(kube_node_status_capacity{resource="cpu"})': '12',
        'sum(kube_node_status_capacity{resource="memory"})': '34359738368',
        'sum(rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))': '2.5',
        'sum(container_memory_working_set_bytes{container!="",image!=""})': '4294967296',
      };
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [{ value: [0, values[query ?? '']!] }] } }) };
    });
    expect(result).toEqual({ cpuCapacityCores: 12, memoryCapacityBytes: 34359738368, cpuUsedCores: 2.5, memoryUsedBytes: 4294967296 });
    expect(urls).toHaveLength(4);
    expect(urls.every((url) => url.startsWith('http://prometheus.monitoring.svc:9090/api/v1/query?query='))).toBe(true);
  });

  it('uses three fixed PDU queries and preserves a measured zero outlet draw', async () => {
    const urls: string[] = [];
    const adapter = new PrometheusAdapter('http://prometheus.monitoring.svc:9090', true, { enabled: true, deviceName: 'USP-PDU-Pro' });
    const result = await adapter.readPduPower(async (url) => {
      urls.push(url);
      const query = new URL(url).searchParams.get('query');
      const values: Record<string, string> = {
        'sum(unpoller_device_outlet_outlet_power{name="USP-PDU-Pro"})': '82',
        'sum(unpoller_device_outlet_outlet_power{name="USP-PDU-Pro",outlet_name="pve-01"})': '82',
        'sum(unpoller_device_outlet_outlet_power{name="USP-PDU-Pro",outlet_name="pve-02"})': '0',
      };
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [{ value: [0, values[query ?? '']!] }] } }) };
    });
    expect(result).toMatchObject({ totalWatts: 82, pve01Watts: 82, pve02Watts: 0, metadata: { freshness: 'CURRENT', severity: 'OK' } });
    expect(urls).toHaveLength(3);
    expect(buildPduPowerQueries('PDU "A"').totalWatts).toBe('sum(unpoller_device_outlet_outlet_power{name="PDU \\"A\\""})');
  });

  it('returns INFO/NO_DATA when any validated PDU outlet is missing or Prometheus fails', async () => {
    const adapter = new PrometheusAdapter('http://prometheus.monitoring.svc:9090', true, { enabled: true, deviceName: 'USP-PDU-Pro' });
    const missing = await adapter.readPduPower(async () => ({ ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [] } }) }));
    expect(missing).toMatchObject({ totalWatts: null, pve01Watts: null, pve02Watts: null, metadata: { freshness: 'NO_DATA', severity: 'INFO' } });
    const failed = await adapter.readPduPower(async () => ({ ok: false, json: async () => ({}) }));
    expect(failed.metadata).toMatchObject({ freshness: 'NO_DATA', severity: 'INFO' });
  });

  it('does not query or expose PDU data until the Git-owned mapping is enabled', async () => {
    const adapter = new PrometheusAdapter('http://prometheus.monitoring.svc:9090', true, { enabled: false, deviceName: 'USP-PDU-Pro' });
    const result = await adapter.readPduPower(async () => { throw new Error('disabled PDU must not query Prometheus'); });
    expect(result).toMatchObject({ totalWatts: null, metadata: { freshness: 'NOT_SUPPORTED', severity: 'INFO' } });
  });

  it('reads fixed UDM Pro appliance and WAN telemetry without browser-supplied PromQL', async () => {
    const adapter = new PrometheusAdapter('http://prometheus.monitoring.svc:9090', true);
    const catalog = buildUdmQueries();
    const samples = new Map<string, string>(Object.values(catalog).map((query, index) => [query, ['5.152', '3.021', '227785056756', '17448129705', '11', '8.2', '74.5', '43.5', '530660', '19'][index]!]));
    const result = await adapter.readUdm(async (url) => {
      const query = new URL(url).searchParams.get('query') ?? '';
      return { ok: true, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [{ value: [0, samples.get(query)!] }] } }) };
    });

    expect(result).toMatchObject({
      wanDownloadMbps: 5.152,
      wanUploadMbps: 3.021,
      wanTotalBytes: 245_233_186_461,
      latencyMs: 11,
      cpuPercent: 8.2,
      memoryPercent: 74.5,
      temperatureCelsius: 43.5,
      uptimeSeconds: 530_660,
      clientCount: 19,
      metadata: { source: 'unpoller-udm', freshness: 'CURRENT', severity: 'OK' },
    });
  });
});
