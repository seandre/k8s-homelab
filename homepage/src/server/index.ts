import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { LiveTelemetry } from './live-telemetry.js';
import { BootstrapEventBroker } from './sse.js';
import { gitOwnedRuntimeConfig } from './runtime-config.js';
import { IndoorHistoryAdapter } from './indoor-history.js';

const config = loadConfig();
const logger = createLogger();
const eventBroker = new BootstrapEventBroker();
const telemetry = new LiveTelemetry(gitOwnedRuntimeConfig, (bootstrap) => eventBroker.publish(bootstrap));
const liveTelemetryEnabled = config.environment === 'production' && process.env.LIVE_TELEMETRY === 'true';
const prometheus = gitOwnedRuntimeConfig.sources.find((source) => source.id === 'prometheus-source')!;
const indoorHistory = new IndoorHistoryAdapter(prometheus.endpoint, async (url) => {
  const response = await fetch(url);
  return { ok: response.ok, json: () => response.json() };
});
if (liveTelemetryEnabled) void telemetry.start().catch((error: unknown) => logger.error('telemetry.start.failed', { error: error instanceof Error ? error.message : 'unknown error' }));
const app = buildApp({
  config,
  serveClient: config.environment === 'production',
  eventBroker,
  indoorHistory,
  ...(liveTelemetryEnabled ? { bootstrapProvider: telemetry.bootstrap } : {}),
});
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server.shutdown.start', { signal });
  const timeout = setTimeout(() => {
    logger.error('server.shutdown.timeout', { graceMs: config.shutdownGraceMs });
    process.exit(1);
  }, config.shutdownGraceMs);
  timeout.unref();
  try {
    await app.close();
    telemetry.stop();
    clearTimeout(timeout);
    logger.info('server.shutdown.complete');
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    logger.error('server.shutdown.failed', { error: error instanceof Error ? error.message : 'unknown error' });
    process.exit(1);
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.host, port: config.port });
  logger.info('server.started', { host: config.host, port: config.port, environment: config.environment, liveTelemetryEnabled });
} catch (error) {
  logger.error('server.start.failed', { error: error instanceof Error ? error.message : 'unknown error' });
  process.exit(1);
}
