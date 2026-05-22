import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient, User, UserTier } from '@prisma/client';
import { config } from '../../config';
import { validate } from '../../middleware/validation.middleware';
import { asyncHandler } from '../../middleware/error-handler.middleware';
import { ForbiddenError } from '../../errors/app-error';

/**
 * /api/dev/* — convenience endpoints for the demo client.
 * Only mounted when DEMO_LOGIN_ENABLED is true. Lets the frontend obtain a JWT
 * (and a demo user) without any copy/paste.
 */

const loginBodySchema = z.object({
  email: z.string().email().default('demo@appnation.test'),
  name: z.string().min(1).max(120).optional(),
  tier: z.nativeEnum(UserTier).default(UserTier.ENTERPRISE),
});
type LoginBody = z.infer<typeof loginBodySchema>;

const demoLoginGate: RequestHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!config.get().demo.loginEnabled) {
    return next(new ForbiddenError('demo login disabled'));
  }
  next();
};

export function createDevRouter(prisma: PrismaClient): Router {
  const router: Router = Router();

  // Defense-in-depth: the app-level mount check is the primary gate, but if
  // someone wires this router up manually, refuse to serve requests unless
  // DEMO_LOGIN_ENABLED is truthy.
  router.use(demoLoginGate);

  router.post(
    '/login',
    validate(loginBodySchema, 'body'),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { email, name, tier } = req.body as LoginBody;
      const user: User = await prisma.user.upsert({
        where: { email },
        update: { name: name ?? undefined, tier },
        create: { email, name, tier },
      });
      const token: string = jwt.sign(
        { sub: user.id, email: user.email, tier: user.tier },
        config.get().security.jwtSecret,
        { expiresIn: '24h' },
      );
      res.json({ data: { token, user } });
    }),
  );

  return router;
}
