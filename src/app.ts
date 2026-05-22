import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { config } from './config';
import { AppContainer, buildContainer } from './core/container';
import { requestContextMiddleware } from './middleware/request-context.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';
import {
  errorHandlerMiddleware,
  notFoundHandler,
} from './middleware/error-handler.middleware';
import { createChatRouter } from './modules/chat/chat.routes';
import { createCompletionRouter } from './modules/completion/completion.routes';
import { createAdminRouter } from './modules/admin/admin.routes';
import { createDevRouter } from './modules/dev/dev.routes';
import { ChatController } from './modules/chat/chat.controller';
import { CompletionController } from './modules/completion/completion.controller';

/**
 * Build the Express app.
 * @param container — optional override so tests can inject fake services.
 *                    Defaults to the real composition root.
 */
export function createApp(container?: AppContainer): Express {
  const cfg = config.get();
  const c = container ?? buildContainer();

  const app = express();

  // --- Global middleware (run on every request) -----------------------------
  // Order matters: security → context → body parsing → logging.
  app.disable('x-powered-by');
  app.use(
    helmet({
      // SSE doesn't play well with the default contentSecurityPolicy directives.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: cfg.cors.origins.length === 1 && cfg.cors.origins[0] === '*' ? true : cfg.cors.origins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContextMiddleware);
  app.use(loggingMiddleware);

  // --- Health & meta --------------------------------------------------------
  // Probes the DB on every call so a failing connection is visible to the
  // orchestrator/load-balancer (and not just on first query).
  app.get('/health', async (_req, res) => {
    let dbStatus: 'ok' | 'down' = 'ok';
    try {
      await c.database.client.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'down';
    }
    const healthy: boolean = dbStatus === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      env: cfg.env,
      uptime: process.uptime(),
      database: dbStatus,
      featureFlags: c.featureFlags.all(),
    });
  });

  // --- Route-specific middleware lives inside each module router ------------
  const chatController = new ChatController(c.services.chat);
  const completionController = new CompletionController(c.services.completion);

  app.use('/api/chats', createChatRouter(chatController, c.rateLimiterStore));
  app.use('/api/chats', createCompletionRouter(completionController, c.rateLimiterStore));
  app.use('/api/admin', createAdminRouter());

  // Demo-only mock-login route. Opt-in via DEMO_LOGIN_ENABLED so production
  // deployments never expose it by accident, even with NODE_ENV mis-set.
  if (cfg.demo.loginEnabled) {
    app.use('/api/dev', createDevRouter(c.database.client));
  }

  // --- Terminal handlers ----------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandlerMiddleware);

  return app;
}
