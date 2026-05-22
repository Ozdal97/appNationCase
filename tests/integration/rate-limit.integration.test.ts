import request from 'supertest';
import { buildTestApp, signJwt } from '../helpers/test-app';
import { featureFlags } from '../../src/feature-flags/feature-flag.service';

describe('rate limiter (integration)', () => {
  it('returns 429 once RATE_LIMIT_PER_MINUTE is exceeded', async () => {
    featureFlags.set('RATE_LIMIT_PER_MINUTE', 3);

    const { app, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const auth = `Bearer ${token}`;

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get('/api/chats').set('Authorization', auth);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
    expect(statuses[4]).toBe(429);
  });
});
