import { RequestHandler, Router } from 'express';
import { ChatController } from './chat.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { appCheckMiddleware } from '../../middleware/app-check.middleware';
import { clientDetectionMiddleware } from '../../middleware/client-detection.middleware';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { createRateLimiter, RateLimiterStore } from '../../middleware/rate-limit.middleware';
import {
  chatIdParamSchema,
  createChatBodySchema,
  historyQuerySchema,
  listChatsQuerySchema,
} from './chat.validators';

export function createChatRouter(
  controller: ChatController,
  rateLimiterStore?: RateLimiterStore,
): Router {
  const router: Router = Router();

  // Route-specific middleware chain (case study explicitly requires this approach).
  // Order matters: AppCheck -> Auth -> ClientType -> RateLimit -> Validation -> Handler.
  const baseChain: ReadonlyArray<RequestHandler> = [
    appCheckMiddleware,
    authMiddleware,
    clientDetectionMiddleware,
    createRateLimiter(rateLimiterStore),
  ];

  router.get(
    '/',
    ...baseChain,
    validate(listChatsQuerySchema, 'query'),
    asyncHandler(controller.listChats),
  );

  router.post(
    '/',
    ...baseChain,
    validate(createChatBodySchema, 'body'),
    asyncHandler(controller.createChat),
  );

  router.get(
    '/:chatId/history',
    ...baseChain,
    validate(chatIdParamSchema, 'params'),
    validate(historyQuerySchema, 'query'),
    asyncHandler(controller.getHistory),
  );

  return router;
}
