import Redis from 'ioredis';
import { logger } from '../../core/logger';
import { RateLimiterStore } from './rate-limiter-store';

/**
 * Redis-backed rate limit store. Uses INCR + EXPIRE NX in a single pipeline so
 * concurrent hits inside the same window don't race.
 *
 * Switch to this in horizontally-scaled deployments where the in-memory store's
 * per-process buckets would let users bypass limits by hitting different pods.
 */
export class RedisRateLimiterStore implements RateLimiterStore {
  readonly name = 'redis';
  private readonly client: Redis;

  constructor(url: string) {
    if (!url) throw new Error('RedisRateLimiterStore requires a non-empty URL');
    this.client = new Redis(url, { lazyConnect: true });
    this.client.on('error', (err: Error) =>
      logger.error('redis store error', { error: err.message }),
    );
  }

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const ttlSeconds: number = Math.max(1, Math.ceil(windowMs / 1000));
    const fullKey = `rl:${key}`;

    const results = await this.client
      .multi()
      .incr(fullKey)
      .expire(fullKey, ttlSeconds, 'NX')
      .pttl(fullKey)
      .exec();

    if (!results) {
      throw new Error('redis pipeline returned null');
    }

    const count = Number(results[0]?.[1] ?? 0);
    const pttl = Number(results[2]?.[1] ?? windowMs);
    const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs);
    return { count, resetAt };
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // best-effort
    }
  }
}
