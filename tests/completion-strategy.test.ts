import { Response } from 'express';
import { featureFlags } from '../src/feature-flags/feature-flag.service';
import { CompletionStrategyFactory } from '../src/feature-flags/strategies/completion-strategy.factory';
import { AIService } from '../src/ai/ai.service';
import { MockAIProvider } from '../src/ai/providers/mock-ai.provider';

function fakeRes() {
  const chunks: string[] = [];
  let statusCode = 0;
  const headers: Record<string, string> = {};
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    flushHeaders() {},
    write(c: string) {
      chunks.push(c);
      return true;
    },
    end() {},
    on(_event: string, _cb: () => void) {
      // streaming strategy registers a 'close' listener; ignore in the fake.
      return this;
    },
    json(payload: unknown) {
      chunks.push(JSON.stringify(payload));
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    get chunks() {
      return chunks;
    },
  } as unknown as Response & { chunks: string[]; headers: Record<string, string> };
}

describe('CompletionStrategyFactory', () => {
  const ai = new AIService(new MockAIProvider(featureFlags));
  const factory = new CompletionStrategyFactory(featureFlags, ai);

  it('picks streaming when STREAMING_ENABLED is true', async () => {
    featureFlags.set('STREAMING_ENABLED', true);
    const strategy = factory.resolve();
    expect(strategy.name).toBe('streaming');

    const res = fakeRes();
    const result = await strategy.execute(
      { chatId: 'c1', prompt: 'hello', history: [] },
      res,
    );
    expect(result.fullText.length).toBeGreaterThan(0);
    const joined = (res as unknown as { chunks: string[] }).chunks.join('');
    expect(joined).toContain('event: start');
    expect(joined).toContain('event: done');
  });

  it('picks json when STREAMING_ENABLED is false', async () => {
    featureFlags.set('STREAMING_ENABLED', false);
    const strategy = factory.resolve();
    expect(strategy.name).toBe('json');

    const res = fakeRes();
    await strategy.execute({ chatId: 'c1', prompt: 'hi', history: [] }, res);
    const joined = (res as unknown as { chunks: string[] }).chunks.join('');
    expect(joined).toContain('"role":"assistant"');
  });

  it('runs the weather tool when AI_TOOLS_ENABLED is true', async () => {
    featureFlags.set('STREAMING_ENABLED', false);
    featureFlags.set('AI_TOOLS_ENABLED', true);
    const result = await ai.complete({
      chatId: 'c1',
      prompt: 'What is the weather in Istanbul?',
      history: [],
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe('getCurrentWeather');
  });

  it('skips tools when AI_TOOLS_ENABLED is false', async () => {
    featureFlags.set('AI_TOOLS_ENABLED', false);
    const result = await ai.complete({
      chatId: 'c1',
      prompt: 'What is the weather in Istanbul?',
      history: [],
    });
    expect(result.toolCalls).toHaveLength(0);
  });
});
