import { RateLimiterStore } from './rate-limiter-store';

interface Bucket {
  count: number;
  resetAt: number;
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Process-local rate limit store. Fine for a single instance; for horizontal
 * scaling switch to {@link RedisRateLimiterStore}.
 */
export class InMemoryRateLimiterStore implements RateLimiterStore {
  readonly name = 'memory';
  private readonly buckets: Map<string, Bucket> = new Map<string, Bucket>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval((): void => {
      const now: number = Date.now();
      for (const [k, b] of this.buckets) {
        if (b.resetAt <= now) this.buckets.delete(k);
      }
    }, SWEEP_INTERVAL_MS);
    this.sweeper.unref?.();
  }

  async hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now: number = Date.now();
    let bucket: Bucket | undefined = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return { count: bucket.count, resetAt: bucket.resetAt };
  }

  close(): void {
    clearInterval(this.sweeper);
    this.buckets.clear();
  }
}
