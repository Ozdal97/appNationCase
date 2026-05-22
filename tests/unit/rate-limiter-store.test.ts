import { InMemoryRateLimiterStore } from '../../src/middleware/rate-limit/in-memory.store';

describe('InMemoryRateLimiterStore', () => {
  it('counts hits within the same window', async () => {
    const store = new InMemoryRateLimiterStore();
    const first = await store.hit('alice', 60_000);
    const second = await store.hit('alice', 60_000);
    const third = await store.hit('alice', 60_000);
    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    expect(third.count).toBe(3);
    expect(first.resetAt).toBe(second.resetAt);
    expect(second.resetAt).toBe(third.resetAt);
    store.close();
  });

  it('resets the counter when the window has expired', async () => {
    const store = new InMemoryRateLimiterStore();
    // Use a 1ms window; sleep > 1ms so it expires.
    const first = await store.hit('bob', 1);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    const second = await store.hit('bob', 1);
    expect(first.count).toBe(1);
    expect(second.count).toBe(1);
    expect(second.resetAt).toBeGreaterThan(first.resetAt);
    store.close();
  });

  it('isolates buckets per key', async () => {
    const store = new InMemoryRateLimiterStore();
    await store.hit('alice', 60_000);
    await store.hit('alice', 60_000);
    const bob = await store.hit('bob', 60_000);
    expect(bob.count).toBe(1);
    store.close();
  });
});
