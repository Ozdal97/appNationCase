import request from 'supertest';
import { buildTestApp, signJwt } from '../helpers/test-app';
import { featureFlags } from '../../src/feature-flags/feature-flag.service';

describe('auth middleware (integration)', () => {
  beforeAll(() => {
    featureFlags.set('RATE_LIMIT_PER_MINUTE', 1000);
  });

  it('rejects requests without a bearer token', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/chats');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('rejects requests with a bad token', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/chats').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('accepts a valid bearer token', async () => {
    const { app, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app).get('/api/chats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('echoes a stable x-request-id header', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/health').set('x-request-id', 'fixed-rid');
    expect(res.headers['x-request-id']).toBe('fixed-rid');
  });
});
