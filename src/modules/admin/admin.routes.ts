import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import { featureFlags } from '../../feature-flags/feature-flag.service';
import {
  FeatureFlagKey,
  FeatureFlagSchema,
  FeatureFlagValue,
} from '../../feature-flags/feature-flag.types';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { BadRequestError, UnauthorizedError } from '../../errors/app-error';

/**
 * Admin endpoints — mounted under /api/admin. Protected by a shared-secret
 * header. Lets ops flip a flag at runtime without redeploy:
 *
 *   curl -X PATCH /api/admin/feature-flags/STREAMING_ENABLED \
 *        -H "x-admin-token: dev-admin-token" \
 *        -H "Content-Type: application/json" \
 *        -d '{"value": false}'
 */
const adminAuth: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const expected: string = process.env.ADMIN_TOKEN ?? 'dev-admin-token';
  const got: string | undefined = req.header('x-admin-token');
  if (got !== expected) return next(new UnauthorizedError('Admin token invalid'));
  next();
};

const flagBodySchema = z.object({
  value: z.union([z.boolean(), z.number().int()]),
});
type FlagBody = z.infer<typeof flagBodySchema>;

const reloadBodySchema = z
  .object({
    STREAMING_ENABLED: z.boolean().optional(),
    PAGINATION_LIMIT: z.number().int().min(10).max(100).optional(),
    AI_TOOLS_ENABLED: z.boolean().optional(),
    CHAT_HISTORY_ENABLED: z.boolean().optional(),
    RATE_LIMIT_PER_MINUTE: z.number().int().positive().optional(),
    CHAT_HISTORY_LIMITED_COUNT: z.number().int().positive().optional(),
  })
  .strict();
type ReloadBody = z.infer<typeof reloadBodySchema>;

const FLAG_KEYS: ReadonlySet<FeatureFlagKey> = new Set<FeatureFlagKey>([
  'STREAMING_ENABLED',
  'PAGINATION_LIMIT',
  'AI_TOOLS_ENABLED',
  'CHAT_HISTORY_ENABLED',
  'RATE_LIMIT_PER_MINUTE',
  'CHAT_HISTORY_LIMITED_COUNT',
]);

function assertKnownFlagKey(raw: string): FeatureFlagKey {
  if (!FLAG_KEYS.has(raw as FeatureFlagKey)) {
    throw new BadRequestError(`Unknown feature flag '${raw}'`);
  }
  return raw as FeatureFlagKey;
}

export function createAdminRouter(): Router {
  const router: Router = Router();
  router.use(adminAuth);

  router.get(
    '/feature-flags',
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      res.json({ data: featureFlags.all() });
    }),
  );

  router.patch(
    '/feature-flags/:key',
    validate(flagBodySchema, 'body'),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const rawKey: string = String(req.params.key);
      const key: FeatureFlagKey = assertKnownFlagKey(rawKey);
      const { value } = req.body as FlagBody;
      // The flag set() applies a per-key validator and returns false on mismatch,
      // so the runtime guarantees type safety even though we widen via cast here.
      const ok: boolean = featureFlags.set(
        key,
        value as FeatureFlagValue<typeof key>,
      );
      if (!ok) throw new BadRequestError(`Invalid value for flag '${key}'`);
      res.json({ data: featureFlags.all() });
    }),
  );

  router.post(
    '/feature-flags/reload',
    validate(reloadBodySchema, 'body'),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const body: ReloadBody = req.body as ReloadBody;
      featureFlags.reload(body as Partial<FeatureFlagSchema>);
      res.json({ data: featureFlags.all() });
    }),
  );

  return router;
}
