/**
 * Pluggable backing store for the rate limiter. The Strategy lives at the
 * persistence layer: behavior (limit-check, headers, 429) is shared; only
 * "how do we count hits" changes.
 *
 * - {@link InMemoryRateLimiterStore} — single-process, no external deps.
 * - {@link RedisRateLimiterStore}    — multi-instance safe via INCR + EXPIRE.
 */
export interface RateLimiterStore {
  readonly name: string;
  /**
   * Records one hit for `key` and returns the bucket state.
   * The bucket window MUST be exactly `windowMs` starting at the first hit.
   */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  /** Releases any resources (timers, sockets). Called from server shutdown. */
  close?(): Promise<void> | void;
}
