import request from 'supertest';
import { buildTestApp } from '../helpers/test-app';
import { featureFlags } from '../../src/feature-flags/feature-flag.service';

const ADMIN_TOKEN = 'dev-admin-token';

describe('admin routes (integration)', () => {
  it('requires the admin token', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/admin/feature-flags');
    expect(res.status).toBe(401);
  });

  it('returns the current flag snapshot', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .get('/api/admin/feature-flags')
      .set('x-admin-token', ADMIN_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.data.STREAMING_ENABLED).toBeDefined();
    expect(res.body.data.PAGINATION_LIMIT).toBeDefined();
  });

  it('PATCH updates a single flag', async () => {
    const { app } = buildTestApp();
    const next = !featureFlags.get('STREAMING_ENABLED');
    const res = await request(app)
      .patch('/api/admin/feature-flags/STREAMING_ENABLED')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ value: next });
    expect(res.status).toBe(200);
    expect(featureFlags.get('STREAMING_ENABLED')).toBe(next);
  });

  it('rejects an out-of-range PAGINATION_LIMIT', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .patch('/api/admin/feature-flags/PAGINATION_LIMIT')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ value: 9999 });
    expect(res.status).toBe(400);
  });

  it('bulk reloads via /reload', async () => {
    const { app } = buildTestApp();
    const res = await request(app)
      .post('/api/admin/feature-flags/reload')
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ PAGINATION_LIMIT: 25, STREAMING_ENABLED: true });
    expect(res.status).toBe(200);
    expect(featureFlags.get('PAGINATION_LIMIT')).toBe(25);
    expect(featureFlags.get('STREAMING_ENABLED')).toBe(true);
  });
});
