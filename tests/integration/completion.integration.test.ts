import request from 'supertest';
import { buildTestApp, signJwt } from '../helpers/test-app';
import { featureFlags } from '../../src/feature-flags/feature-flag.service';

describe('completion route (integration)', () => {
  beforeEach(() => {
    featureFlags.set('RATE_LIMIT_PER_MINUTE', 1000);
    featureFlags.set('AI_TOOLS_ENABLED', false);
  });

  it('returns JSON when STREAMING_ENABLED is false', async () => {
    featureFlags.set('STREAMING_ENABLED', false);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post(`/api/chats/${data.chats[0]!.id}/completion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'hello there' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.data.message.role).toBe('assistant');
    expect(res.body.meta.streaming).toBe(false);
    expect(res.body.data.toolCalls).toHaveLength(0);
  });

  it('returns SSE when STREAMING_ENABLED is true', async () => {
    featureFlags.set('STREAMING_ENABLED', true);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post(`/api/chats/${data.chats[0]!.id}/completion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'hello there' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const body = res.text;
    expect(body).toContain('event: start');
    expect(body).toContain('event: token');
    expect(body).toContain('event: done');
  });

  it('emits a tool_execution event when AI_TOOLS_ENABLED is true', async () => {
    featureFlags.set('STREAMING_ENABLED', true);
    featureFlags.set('AI_TOOLS_ENABLED', true);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post(`/api/chats/${data.chats[0]!.id}/completion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'What is the weather in Ankara?' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: tool_execution');
    expect(res.text).toContain('getCurrentWeather');
  });

  it('skips tools when AI_TOOLS_ENABLED is false', async () => {
    featureFlags.set('STREAMING_ENABLED', true);
    featureFlags.set('AI_TOOLS_ENABLED', false);
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post(`/api/chats/${data.chats[0]!.id}/completion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: 'What is the weather in Ankara?' });
    expect(res.text).not.toContain('event: tool_execution');
  });

  it('422 on empty prompt', async () => {
    const { app, data, userId } = buildTestApp();
    const token = signJwt({ sub: userId });
    const res = await request(app)
      .post(`/api/chats/${data.chats[0]!.id}/completion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prompt: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
