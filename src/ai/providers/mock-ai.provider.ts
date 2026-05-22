import { FeatureFlagReader } from '../../feature-flags/feature-flag.types';
import {
  AICompleteResult,
  AIStreamEvent,
  CompletionRequest,
  ToolCallEvent,
} from '../ai.service';
import { getCurrentWeatherTool, WeatherOutput } from '../tools/weather.tool';
import { AIProvider } from './ai-provider';

/**
 * Deterministic in-process provider. Honours AI_TOOLS_ENABLED, runs the mocked
 * weather tool when the prompt mentions weather, otherwise echoes a canned reply.
 * No network calls — safe for tests, demos, and offline development.
 */
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  private static readonly TOKEN_DELAY_MS = 15;
  private static readonly WEATHER_RE =
    /weather (?:in|for) ([A-Za-z][A-Za-z\s-]+?)(?:\?|$|\.)/i;

  constructor(private readonly flags: FeatureFlagReader) {}

  async *stream(req: CompletionRequest): AsyncGenerator<AIStreamEvent, void, void> {
    yield { type: 'thinking', stage: 'considering tools' };

    const toolCalls: ReadonlyArray<ToolCallEvent> = await this.maybeRunTools(req.prompt);
    for (const tool of toolCalls) {
      yield { type: 'tool_call', tool };
    }

    yield { type: 'thinking', stage: 'composing response' };

    const text: string = this.generateResponse(req, toolCalls);
    for (const word of text.split(/(\s+)/)) {
      if (!word) continue;
      if (process.env.NODE_ENV !== 'test') {
        await MockAIProvider.delay(MockAIProvider.TOKEN_DELAY_MS);
      }
      yield { type: 'token', value: word };
    }
  }

  async complete(req: CompletionRequest): Promise<AICompleteResult> {
    const toolCalls: ReadonlyArray<ToolCallEvent> = await this.maybeRunTools(req.prompt);
    const text: string = this.generateResponse(req, toolCalls);
    return { text, toolCalls };
  }

  private async maybeRunTools(prompt: string): Promise<ReadonlyArray<ToolCallEvent>> {
    if (!this.flags.isEnabled('AI_TOOLS_ENABLED')) return [];

    const out: ToolCallEvent[] = [];
    const match: RegExpMatchArray | null = prompt.match(MockAIProvider.WEATHER_RE);
    if (match) {
      const city: string = match[1]!.trim();
      const output: WeatherOutput = await getCurrentWeatherTool.execute({ city });
      out.push({ name: getCurrentWeatherTool.name, input: { city }, output });
    }
    return out;
  }

  private generateResponse(
    req: CompletionRequest,
    tools: ReadonlyArray<ToolCallEvent>,
  ): string {
    if (tools.length > 0) {
      const summaries: string = tools
        .map((tool) => {
          const out = tool.output as WeatherOutput;
          return `the weather in ${out.city} is ${out.condition} at ${out.temperatureC}°C`;
        })
        .join('; ');
      return `Based on the tools I called: ${summaries}. Anything else you'd like to know about "${req.prompt}"?`;
    }
    const historyHint: string = req.history.length
      ? ` (continuing a conversation with ${req.history.length} prior messages)`
      : '';
    return `This is a mocked AI reply to "${req.prompt}"${historyHint}. The system is wired end-to-end — wire a real provider into AIService to replace this text.`;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
