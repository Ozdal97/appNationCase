import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../errors/app-error';
import { AuthenticatedUser } from '../types/express';

const BEARER_PREFIX = 'bearer ';

/**
 * Simplified JWT auth middleware.
 * Expects: `Authorization: Bearer <token>`
 * Token payload shape: { sub: string; email: string; tier: 'FREE'|'STARTUP'|'ENTERPRISE' }
 */
export const authMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const auth: string | undefined = req.header('authorization');
  if (!auth || !auth.toLowerCase().startsWith(BEARER_PREFIX)) {
    return next(new UnauthorizedError('Missing bearer token'));
  }
  const token: string = auth.slice(BEARER_PREFIX.length).trim();
  try {
    const decoded = jwt.verify(token, config.get().security.jwtSecret) as JwtPayload;
    if (!decoded.sub || !decoded.email) {
      return next(new UnauthorizedError('Token payload incomplete'));
    }
    const user: AuthenticatedUser = {
      id: String(decoded.sub),
      email: String(decoded.email),
      tier: (decoded.tier as AuthenticatedUser['tier']) ?? 'FREE',
    };
    req.user = user;
    next();
  } catch (err: unknown) {
    next(new UnauthorizedError(err instanceof Error ? err.message : 'Invalid token'));
  }
};
