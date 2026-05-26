import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import { FeatureFlagReader } from '../../feature-flags/feature-flag.types';
import { logger } from '../../core/logger';
import {
  AICompleteResult,
  AIStreamEvent,
  CompletionRequest,
  ToolCallEvent,
} from '../ai.service';
import { getCurrentWeatherTool } from '../tools/weather.tool';
import { AIProvider } from './ai-provider';

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string };

interface SdkToolCall {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly args: unknown;
}
interface SdkToolResult {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly result: unknown;
}

/** The Vercel AI SDK's model handle returned by `createOpenAI()`. */
type SdkModel = Parameters<typeof streamText>[0]['model'];

/**
 * OpenAI provider via the Vercel AI SDK. Activated with AI_PROVIDER=openai and
 * OPENAI_API_KEY; model defaults to gpt-5.4-mini (override with OPENAI_MODEL).
 *
 * Emits the same event shape as {@link MockAIProvider}, so the Strategy/SSE
 * layer above is provider-agnostic — swapping mock↔openai is one env var.
 */
export class OpenAIProvider implements AIProvider {
  readonly name: string;
  private readonly model: SdkModel;

  constructor(
    private readonly flags: FeatureFlagReader,
    apiKey: string,
    model = 'gpt-5.4-mini',
  ) {
    if (!apiKey) {
      throw new Error('OpenAIProvider requires OPENAI_API_KEY');
    }
    this.model = createOpenAI({ apiKey })(model);
    this.name = `openai:${model}`;
  }

  async *stream(req: CompletionRequest): AsyncGenerator<AIStreamEvent, void, void> {
    yield { type: 'thinking', stage: 'preparing request' };

    const result = streamText({
      model: this.model,
      system: req.systemPrompt,
      messages: this.buildMessages(req),
      tools: this.maybeBuildTools(),
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        yield { type: 'token', value: part.textDelta };
      } else if (part.type === 'tool-call') {
        // The SDK reports tool execution results via result.steps, not the
        // streaming event channel — we surface a placeholder output here and
        // could enrich it post-finish if needed.
        yield {
          type: 'tool_call',
          tool: { name: part.toolName, input: part.args, output: null },
        };
      } else if (part.type === 'error') {
        const message = part.error instanceof Error ? part.error.message : String(part.error);
        logger.error('openai provider stream error', { provider: this.name, error: message });
        throw part.error instanceof Error ? part.error : new Error(message);
      }
      // Other event kinds (reasoning/source/step-start/step-finish/finish) are ignored.
    }
  }

  async complete(req: CompletionRequest): Promise<AICompleteResult> {
    const out = await generateText({
      model: this.model,
      system: req.systemPrompt,
      messages: this.buildMessages(req),
      tools: this.maybeBuildTools(),
    });

    const toolResults: ReadonlyArray<SdkToolResult> = (out.toolResults ?? []) as ReadonlyArray<SdkToolResult>;
    const toolCalls: ToolCallEvent[] = ((out.toolCalls ?? []) as ReadonlyArray<SdkToolCall>).map(
      (tc): ToolCallEvent => ({
        name: tc.toolName,
        input: tc.args,
        output: toolResults.find((tr) => tr.toolCallId === tc.toolCallId)?.result ?? null,
      }),
    );

    return { text: out.text, toolCalls };
  }

  private buildMessages(req: CompletionRequest): ChatMessage[] {
    return [
      ...req.history.map<ChatMessage>((m) => ({
        role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
        content: m.content,
      })),
      { role: 'user', content: req.prompt },
    ];
  }

  private maybeBuildTools(): Parameters<typeof streamText>[0]['tools'] | undefined {
    if (!this.flags.isEnabled('AI_TOOLS_ENABLED')) return undefined;
    return {
      getCurrentWeather: tool({
        description: 'Returns the current weather for a given city',
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }: { city: string }) =>
          getCurrentWeatherTool.execute({ city }),
      }),
    };
  }
}
