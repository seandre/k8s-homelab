import fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BootstrapSchema, type Bootstrap, type PublicConfig } from '../shared/contracts.js';
import { healthyBootstrapFixture } from '../shared/fixtures.js';
import { createLogger } from './logger.js';
import { BootstrapEventBroker, type SseConnection } from './sse.js';
import { gitOwnedRuntimeConfig, type RuntimeConfig } from './runtime-config.js';
import { INDOOR_HISTORY_WINDOWS, isIndoorHistoryAlias, type IndoorHistoryAdapter, type IndoorHistoryWindow } from './indoor-history.js';
import { type IndoorActionGateway } from './indoor-actions.js';
import { isWeatherHistoryAlias, type WeatherHistoryAdapter } from './weather-history.js';

export type BootstrapProvider = () => Bootstrap | Promise<Bootstrap>;

export interface AppOptions {
  config: PublicConfig;
  bootstrapProvider?: BootstrapProvider;
  ready?: () => boolean;
  serveClient?: boolean;
  eventBroker?: BootstrapEventBroker;
  keepAliveMs?: number;
  runtimeConfig?: RuntimeConfig;
  indoorHistory?: Pick<IndoorHistoryAdapter, 'read'>;
  weatherHistory?: Pick<WeatherHistoryAdapter, 'read'>;
  indoorActions?: IndoorActionGateway;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    trustProxy: (address) => address.startsWith('10.') || address === '127.0.0.1' || address === '::1',
  });
  const logger = createLogger();
  const bootstrapProvider = options.bootstrapProvider ?? (() => healthyBootstrapFixture);
  const isReady = options.ready ?? (() => true);
  const eventBroker = options.eventBroker ?? new BootstrapEventBroker();
  const keepAliveMs = options.keepAliveMs ?? 15_000;
  const runtimeConfig = options.runtimeConfig ?? gitOwnedRuntimeConfig;

  app.addHook('onResponse', async (request, reply) => {
    logger.info('request.complete', {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });
  });

  app.get('/api/health/live', async () => ({ status: 'ok', requestId: undefined }));

  app.get('/api/health/ready', async (request, reply) => {
    if (!isReady()) {
      return reply.code(503).send({ status: 'not_ready', requestId: request.id });
    }
    return { status: 'ready', requestId: request.id };
  });

  app.get('/api/v1/bootstrap', async (request, reply) => {
    try {
      const payload = BootstrapSchema.parse(await bootstrapProvider());
      if (options.indoorActions) payload.indoor.actions = options.indoorActions.statuses();
      return { data: payload, requestId: request.id };
    } catch (error) {
      logger.error('bootstrap.failed', {
        requestId: request.id,
        error: error instanceof Error ? error.message : 'unknown error',
      });
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Bootstrap data is temporarily unavailable.' },
        requestId: request.id,
      });
    }
  });

  app.post('/api/v1/indoor/actions', { bodyLimit: 8_192 }, async (request, reply) => {
    if (!options.indoorActions) return reply.code(503).send({ error: { code: 'ACTIONS_UNAVAILABLE', message: 'Indoor controls are temporarily unavailable.' }, requestId: request.id });
    const result = await options.indoorActions.accept(request.body, {
      sourceIp: request.ip,
      origin: request.headers.origin,
      host: request.headers.host,
      forwardedHost: typeof request.headers['x-forwarded-host'] === 'string' ? request.headers['x-forwarded-host'] : undefined,
      forwardedProto: typeof request.headers['x-forwarded-proto'] === 'string' ? request.headers['x-forwarded-proto'] : undefined,
      fetchSite: typeof request.headers['sec-fetch-site'] === 'string' ? request.headers['sec-fetch-site'] : undefined,
      fetchMode: typeof request.headers['sec-fetch-mode'] === 'string' ? request.headers['sec-fetch-mode'] : undefined,
      contentType: request.headers['content-type'],
    });
    if (!result.ok) return reply.code(result.statusCode).send({ error: { code: result.code, message: result.message }, requestId: request.id });
    return reply.code(202).send({ data: result.action, requestId: request.id });
  });

  app.get('/api/v1/history', async (request, reply) => {
    const query = request.query as { metric?: string; window?: string; start?: string; end?: string };
    const validWindows = ['5m', '15m', ...INDOOR_HISTORY_WINDOWS, 'custom'];
    if (!query.metric || !query.window || !validWindows.includes(query.window)) {
      return reply.code(400).send({ error: { code: 'INVALID_HISTORY_QUERY', message: 'A valid metric and window are required.' }, requestId: request.id });
    }
    const start = query.start ? new Date(query.start) : null;
    const end = query.end ? new Date(query.end) : null;
    const customRange = query.window === 'custom';
    if (customRange && (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end.getTime() > Date.now() + 300_000)) {
      return reply.code(400).send({ error: { code: 'INVALID_HISTORY_RANGE', message: 'A valid past start and end time are required for a custom range.' }, requestId: request.id });
    }
    try {
      const bootstrap = BootstrapSchema.parse(await bootstrapProvider());
      const allowedMetric = runtimeConfig.historyMetrics.some((candidate) => candidate.metric === query.metric && candidate.windows.includes(query.window as '5m' | '15m' | '1h'));
      if (!allowedMetric) return reply.code(404).send({ error: { code: 'HISTORY_NOT_FOUND', message: 'History is not available for this metric/window.' }, requestId: request.id });
      if (isIndoorHistoryAlias(query.metric) && (INDOOR_HISTORY_WINDOWS.includes(query.window as IndoorHistoryWindow) || customRange) && options.indoorHistory) {
        const indoorSeries = await options.indoorHistory.read(
          query.metric,
          query.window as IndoorHistoryWindow | 'custom',
          customRange ? { start: start!, end: end! } : undefined,
        );
        if (indoorSeries) return { data: indoorSeries, requestId: request.id };
        return reply.code(404).send({ error: { code: 'HISTORY_NOT_FOUND', message: 'History is not available for this metric/window.' }, requestId: request.id });
      }
      if (isWeatherHistoryAlias(query.metric) && (INDOOR_HISTORY_WINDOWS.includes(query.window as IndoorHistoryWindow) || customRange) && options.weatherHistory) {
        const outdoorSeries = await options.weatherHistory.read(query.metric, query.window as IndoorHistoryWindow | 'custom', customRange ? { start: start!, end: end! } : undefined);
        if (outdoorSeries) return { data: outdoorSeries, requestId: request.id };
        return reply.code(404).send({ error: { code: 'HISTORY_NOT_FOUND', message: 'History is not available for this metric/window.' }, requestId: request.id });
      }
      const series = bootstrap.timeSeries.find((candidate) => candidate.metric === query.metric && candidate.window === query.window);
      if (!series) return reply.code(404).send({ error: { code: 'HISTORY_NOT_FOUND', message: 'History is not available for this metric/window.' }, requestId: request.id });
      return { data: series, requestId: request.id };
    } catch (error) {
      logger.error('history.failed', { requestId: request.id, error: error instanceof Error ? error.message : 'unknown error' });
      return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'History is temporarily unavailable.' }, requestId: request.id });
    }
  });

  app.get('/api/v1/events', (request, reply) => {
    const lastEventId = request.headers['last-event-id'];
    const requestedId = Number(lastEventId);
    // A new browser receives the current state from /bootstrap and subscribes
    // only to future events. A reconnect supplies Last-Event-ID and replays
    // genuinely missed events from the bounded broker history.
    const afterId = lastEventId === undefined
      ? eventBroker.latestEventId()
      : Number.isSafeInteger(requestedId) && requestedId >= 0 ? requestedId : eventBroker.latestEventId();
    reply.hijack();
    let closed = false;
    let backpressured = false;
    reply.raw.once('close', () => { closed = true; });
    reply.raw.on('drain', () => { backpressured = false; });
    // A disconnect can occur while the broker is replaying buffered events.
    // Keep that normal race from becoming an unhandled process-level error.
    reply.raw.on('error', () => { closed = true; });
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    reply.raw.flushHeaders();
    const connection: SseConnection = {
      write: (chunk) => {
        if (closed || backpressured || reply.raw.destroyed || reply.raw.writableEnded || reply.raw.writableFinished) return false;
        try {
          // false means the chunk was accepted but the writable buffer is now
          // full; wait for drain before accepting another event instead of
          // incorrectly treating this first backpressure signal as a drop.
          backpressured = !reply.raw.write(chunk);
          return true;
        } catch { return false; }
      },
      end: () => { if (!closed && !reply.raw.writableEnded && !reply.raw.writableFinished) reply.raw.end(); },
      onClose: (handler) => { reply.raw.once('close', handler); reply.raw.once('error', handler); },
    };
    const unsubscribe = eventBroker.subscribe(connection, afterId);
    const interval = setInterval(() => eventBroker.keepAlive(connection), keepAliveMs);
    reply.raw.once('close', () => { unsubscribe(); clearInterval(interval); });
  });

  app.setErrorHandler((error, request, reply) => {
    logger.error('request.failed', {
      requestId: request.id,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    void reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' },
      requestId: request.id,
    });
  });

  if (options.serveClient) {
    app.register(fastifyStatic, {
      root: fileURLToPath(new URL('../../client/', import.meta.url)),
      prefix: '/',
      wildcard: false,
    });
    app.get('/*', (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' }, requestId: request.id });
      }
      const assetPath = (request.params as { '*': string })['*'];
      if (assetPath.includes('.')) return reply.sendFile(assetPath);
      return reply.type('text/html').sendFile('index.html');
    });
  }

  return app;
}
