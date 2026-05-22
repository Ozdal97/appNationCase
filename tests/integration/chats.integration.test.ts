import request from 'supertest';
import { Chat, MessageRole } from '@prisma/client';
import { buildTestApp, signJwt, makeFakeData } from '../helpers/test-app';
import { featureFlags } from '../../src/feature-flags/feature-flag.service';

describe('chats routes (integration)', () => {
  beforeEach(() => {
    featureFlags.set('RATE_LIMIT_PER_MINUTE', 1000);
    featureFlags.set('CHAT_HISTORY_ENABLED', true);
    featureFlags.set('PAGINATION_LIMIT', 20);
  });

  function appWithBulkChats(count: number) {
    const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const data = makeFakeData(userId);
    const extra: Chat[] = Array.from({ length: count - 1 }).map((_, i) => ({
      id: `chat-${String(i).padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
      title: `chat #${i + 2}`,
      userId,
      createdAt: new Date(2024, 0, i + 2),
      updatedAt: new Date(2024, 0, i + 2),
    }));
    data.chats.push(...extra);
    return { ...buildTestApp(data), userId };
  }

  it('caps page size at PAGINATION_LIMIT', async () => {
    featureFlags.set('PAGINATION_LIMIT', 10);
    const { app, userId } = appWithBulkChats(30);
    const token = signJwt({ sub: userId });
    // Validator allows up to 100; the service caps to PAGINATION_LIMIT (10).
    const res = await request(app)
      .get('/api/chats?limit=100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.appliedFlag).toBe('PAGINATION_LIMIT');
    expect(res.body.meta.nextCursor).toBeTruthy();
  });

  it('returns full history when CHAT_HISTORY_ENABLED is true', async () => {
    featureFlags.set('CHAT_HISTORY_ENABLED', true);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const chatId = data.chats[0]!.id;
    const res = await request(app)
      .get(`/api/chats/${chatId}/history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.strategy).toBe('full');
    expect(res.body.data.messages).toHaveLength(2);
  });

  it('returns last N when CHAT_HISTORY_ENABLED is false', async () => {
    featureFlags.set('CHAT_HISTORY_ENABLED', false);
    featureFlags.set('CHAT_HISTORY_LIMITED_COUNT', 1);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const chatId = data.chats[0]!.id;
    const res = await request(app)
      .get(`/api/chats/${chatId}/history`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.strategy).toBe('limited');
    expect(res.body.data.messages).toHaveLength(1);
    expect(res.body.data.messages[0].role).toBe(MessageRole.ASSISTANT);
  });

  it('returns 404 when chat does not belong to the user', async () => {
    const { app } = buildTestApp();
    const token = signJwt({ sub: 'someone-else' });
    const res = await request(app)
      .get('/api/chats/11111111-1111-1111-1111-111111111111/history')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('creates a new chat via POST /api/chats', async () => {
    const { app, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post('/api/chats')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'A brand new conversation' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('A brand new conversation');
    expect(res.body.data.userId).toBe(userId);
  });

  it('uses a fallback title when none is provided', async () => {
    const { app, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post('/api/chats')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(typeof res.body.data.title).toBe('string');
    expect(res.body.data.title.length).toBeGreaterThan(0);
  });

  it('forces limited history for mobile clients regardless of flag', async () => {
    featureFlags.set('CHAT_HISTORY_ENABLED', true);
    featureFlags.set('CHAT_HISTORY_LIMITED_COUNT', 1);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const chatId = data.chats[0]!.id;
    const res = await request(app)
      .get(`/api/chats/${chatId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-client-type', 'mobile');
    expect(res.status).toBe(200);
    expect(res.body.meta.strategy).toBe('limited');
    expect(res.body.data.messages).toHaveLength(1);
  });

  it('caps mobile pagination tighter than the flag', async () => {
    featureFlags.set('PAGINATION_LIMIT', 50);
    const { app, userId } = appWithBulkChats(30);
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .get('/api/chats?limit=100')
      .set('Authorization', `Bearer ${token}`)
      .set('x-client-type', 'mobile');
    expect(res.status).toBe(200);
    // Mobile cap is 15; flag would have permitted 50.
    expect(res.body.meta.limit).toBeLessThanOrEqual(15);
    expect(res.body.data.length).toBeLessThanOrEqual(15);
  });

  it('rejects invalid chatId format with 422', async () => {
    const { app, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .get('/api/chats/not-a-uuid/history')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
