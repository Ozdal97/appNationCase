import { Response } from 'express';
import { AIService, CompletionRequest, ToolCallEvent } from '../../ai/ai.service';
import { FeatureFlagReader } from '../feature-flag.types';
import { logger } from '../../core/logger';

/** What every CompletionStrategy.execute() resolves to. */
export interface CompletionResult {
  readonly fullText: string;
  readonly toolCalls: readonly ToolCallEvent[];
  /** True if the stream/response ended mid-way (client disconnect, AI error, ...) */
  readonly incomplete: boolean;
}

/**
 * Strategy interface — every completion delivery mode (streaming/json) implements
 * this. The controller never inspects feature flags itself; it just delegates
 * to whatever strategy the factory hands back.
 */
export interface CompletionStrategy {
  readonly name: 'streaming' | 'json';
  execute(req: CompletionRequest, res: Response): Promise<CompletionResult>;
}

type SseSender = (event: string, data: unknown) => void;

function createSseSender(res: Response): SseSender {
  return (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
}

/** Streaming strategy: emits SSE events as the AI generates tokens. */
export class StreamingCompletionStrategy implements CompletionStrategy {
  readonly name = 'streaming' as const;

  constructor(private readonly ai: AIService) {}

  async execute(req: CompletionRequest, res: Response): Promise<CompletionResult> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send: SseSender = createSseSender(res);

    let fullText = '';
    const toolCalls: ToolCallEvent[] = [];
    let incomplete = false;

    // Detect client disconnect so we can stop generating tokens early.
    let clientClosed = false;
    res.on('close', () => {
      clientClosed = true;
    });

    send('start', { chatId: req.chatId, timestamp: Date.now() });
    send('thinking', { stage: 'analyzing prompt' });

    try {
      for await (const event of this.ai.stream(req)) {
        if (clientClosed) {
          incomplete = true;
          break;
        }
        switch (event.type) {
          case 'token':
            fullText += event.value;
            send('token', { value: event.value });
            break;
          case 'tool_call':
            toolCalls.push(event.tool);
            send('tool_execution', event.tool);
            break;
          case 'thinking':
            send('thinking', { stage: event.stage });
            break;
        }
      }

      if (!incomplete) {
        send('done', {
          chatId: req.chatId,
          fullText,
          tokens: fullText.length,
          toolCalls,
        });
      }
    } catch (err: unknown) {
      incomplete = true;
      const message: string = err instanceof Error ? err.message : String(err);
      logger.error('streaming strategy failed', { chatId: req.chatId, error: message });
      send('error', { message });
    } finally {
      res.end();
    }

    return { fullText, toolCalls, incomplete };
  }
}

/** JSON strategy: collects the entire AI response and sends a single response. */
export class JsonCompletionStrategy implements CompletionStrategy {
  readonly name = 'json' as const;

  constructor(private readonly ai: AIService) {}

  async execute(req: CompletionRequest, res: Response): Promise<CompletionResult> {
    const { text, toolCalls } = await this.ai.complete(req);

    res.status(200).json({
      data: {
        chatId: req.chatId,
        message: { role: 'assistant', content: text },
        toolCalls,
      },
      meta: { streaming: false, model: 'mock-llm-1' },
    });

    return { fullText: text, toolCalls, incomplete: false };
  }
}

/** Factory: picks the strategy based on STREAMING_ENABLED at call time. */
export class CompletionStrategyFactory {
  constructor(
    private readonly flags: FeatureFlagReader,
    private readonly ai: AIService,
  ) {}

  resolve(): CompletionStrategy {
    return this.flags.isEnabled('STREAMING_ENABLED')
      ? new StreamingCompletionStrategy(this.ai)
      : new JsonCompletionStrategy(this.ai);
  }
}
