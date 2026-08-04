import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { LiveTelemetry } from './live-telemetry.js';
import { BootstrapEventBroker } from './sse.js';
import { gitOwnedRuntimeConfig } from './runtime-config.js';
import { IndoorHistoryAdapter } from './indoor-history.js';
import { readFile } from 'node:fs/promises';
import { IndoorActionGateway } from './indoor-actions.js';
import { HomeAssistantActionExecutor, HomeAssistantControlMapSchema } from './home-assistant-actions.js';
import { FileActionPersistence } from './action-persistence.js';
import { WeatherHistoryAdapter } from './weather-history.js';

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
const weatherHistory = new WeatherHistoryAdapter(gitOwnedRuntimeConfig.weatherLocation.latitude, gitOwnedRuntimeConfig.weatherLocation.longitude, async (url) => {
  const response = await fetch(url);
  return { ok: response.ok, json: () => response.json() };
});
async function loadIndoorActions() {
  if (!liveTelemetryEnabled) return undefined;
  try {
    const [token, mappingJson] = await Promise.all([
      readFile('/var/run/homepage-secrets/home-assistant-control-token/token', 'utf8'),
      readFile('/var/run/homepage-secrets/home-assistant-control/mapping.json', 'utf8'),
    ]);
    const source = gitOwnedRuntimeConfig.sources.find((item) => item.id === 'home-assistant-source')!;
    const executor = new HomeAssistantActionExecutor(source.endpoint, token.trim(), HomeAssistantControlMapSchema.parse(JSON.parse(mappingJson)), async (url, init) => {
      const response = await fetch(url, init);
      return { ok: response.ok };
    });
    return new IndoorActionGateway(
      telemetry.bootstrap, executor, (fields) => logger.info('indoor.action', fields),
      undefined, undefined, undefined, undefined, new FileActionPersistence('/var/lib/homepage/indoor-actions.json'),
    );
  } catch (error) {
    logger.error('indoor.actions.disabled', { error: error instanceof Error ? error.message : 'configuration unavailable' });
    return undefined;
  }
}
const indoorActions = await loadIndoorActions();
if (liveTelemetryEnabled) void telemetry.start().catch((error: unknown) => logger.error('telemetry.start.failed', { error: error instanceof Error ? error.message : 'unknown error' }));
const app = buildApp({
  config,
  serveClient: config.environment === 'production',
  eventBroker,
  indoorHistory,
  weatherHistory,
  ...(indoorActions ? { indoorActions } : {}),
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
