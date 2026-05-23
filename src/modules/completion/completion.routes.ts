import { Router } from 'express';
import type { RequestHandler } from 'express';
import { CompletionController } from './completion.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { appCheckMiddleware } from '../../middleware/app-check.middleware';
import { clientDetectionMiddleware } from '../../middleware/client-detection.middleware';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import {
  createRateLimiter,
  RateLimiterStore,
} from '../../middleware/rate-limit.middleware';
import { FeatureFlagReader } from '../../feature-flags/feature-flag.types';
import {
  chatIdParamSchema,
  completionBodySchema,
} from '../chat/chat.validators';

export function createCompletionRouter(
  controller: CompletionController,
  flags: FeatureFlagReader,
  rateLimiterStore?: RateLimiterStore,
): Router {
  const router: Router = Router({ mergeParams: true });
  const baseChain: ReadonlyArray<RequestHandler> = [
    appCheckMiddleware,
    authMiddleware,
    clientDetectionMiddleware,
    createRateLimiter(flags, rateLimiterStore),
  ];

  router.post(
    '/:chatId/completion',
    ...baseChain,
    validate(chatIdParamSchema, 'params'),
    validate(completionBodySchema, 'body'),
    asyncHandler(controller.run),
  );

  return router;
}
