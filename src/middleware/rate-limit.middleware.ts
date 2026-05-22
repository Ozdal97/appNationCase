import { NextFunction, Request, RequestHandler, Response } from 'express';
import { featureFlags } from '../feature-flags/feature-flag.service';
import { TooManyRequestsError } from '../errors/app-error';
import { logger } from '../core/logger';
import { RateLimiterStore } from './rate-limit/rate-limiter-store';
import { InMemoryRateLimiterStore } from './rate-limit/in-memory.store';

export { RateLimiterStore } from './rate-limit/rate-limiter-store';
export { InMemoryRateLimiterStore } from './rate-limit/in-memory.store';
export { RedisRateLimiterStore } from './rate-limit/redis.store';

const WINDOW_MS = 60_000;

/**
 * Lightweight rate limiter — re-reads RATE_LIMIT_PER_MINUTE every request so
 * config changes apply immediately. Persistence is delegated to the injected
 * {@link RateLimiterStore} (memory by default, Redis available).
 *
 * The container wires a single store instance and passes it to every route's
 * limiter so buckets are shared across mount points.
 */
export function createRateLimiter(store: RateLimiterStore = new InMemoryRateLimiterStore()): RequestHandler {
  return async function rateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const limit: number = featureFlags.get('RATE_LIMIT_PER_MINUTE');
      const key: string = req.user?.id ?? req.ip ?? 'anon';

      const { count, resetAt } = await store.hit(key, WINDOW_MS);

      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

      if (count > limit) {
        return next(new TooManyRequestsError());
      }
      next();
    } catch (err: unknown) {
      // If the store fails (e.g. Redis is down) we fail OPEN — surface the
      // outage in logs and let the request through rather than 500-ing every
      // caller. Switch to fail-closed if your threat model demands it.
      logger.error('rate-limit store error — letting request through', {
        error: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  };
}
