import { createApp } from './app';
import { config } from './config';
import { database } from './core/database';
import { logger } from './core/logger';
import { featureFlags } from './feature-flags/feature-flag.service';

async function main(): Promise<void> {
  const cfg = config.get();

  // Initialisation order: Config → Logger → Database → FeatureFlags → App.
  logger.info('starting service', { env: cfg.env, port: cfg.port });

  await database.connect();
  // touch the singleton so it's constructed before the first request
  featureFlags.all();

  const app = createApp();

  const server = app.listen(cfg.port, () => {
    logger.info('server listening', { port: cfg.port });
  });

  // SSE-friendly timeouts
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  const shutdown = async (signal: string): Promise<void> => {
    logger.warn('shutdown signal received', { signal });
    server.close(() => logger.info('http server closed'));
    await database.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logger.error('unhandledRejection', { err: err instanceof Error ? err.message : String(err) });
  });
  process.on('uncaughtException', (err) => {
    logger.fatal('uncaughtException', { err: err.message, stack: err.stack });
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal startup error', err);
  process.exit(1);
});
