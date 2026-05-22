import { Message } from '@prisma/client';
import { AIProvider } from './providers/ai-provider';

export interface CompletionRequest {
  readonly chatId: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly history: ReadonlyArray<Pick<Message, 'role' | 'content'>>;
}

export interface ToolCallEvent {
  readonly name: string;
  readonly input: unknown;
  readonly output: unknown;
}

export type AIStreamEvent =
  | { readonly type: 'thinking'; readonly stage: string }
  | { readonly type: 'token'; readonly value: string }
  | { readonly type: 'tool_call'; readonly tool: ToolCallEvent };

export interface AICompleteResult {
  readonly text: string;
  readonly toolCalls: ReadonlyArray<ToolCallEvent>;
}

/**
 * Thin façade over a pluggable {@link AIProvider}. Strategies talk to this;
 * the underlying provider is selected by the container based on
 * `config.ai.provider` (mock | vercel).
 */
export class AIService {
  constructor(private readonly provider: AIProvider) {}

  stream(req: CompletionRequest): AsyncGenerator<AIStreamEvent, void, void> {
    return this.provider.stream(req);
  }

  complete(req: CompletionRequest): Promise<AICompleteResult> {
    return this.provider.complete(req);
  }

  get providerName(): string {
    return this.provider.name;
  }
}
