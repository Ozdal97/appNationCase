import { CompletionRequest, AIStreamEvent, AICompleteResult } from '../ai.service';

/**
 * Pluggable provider behind the AIService. Implementations must yield events
 * in the same shape so the Strategy/SSE layer above is provider-agnostic.
 *
 * - {@link MockAIProvider} — deterministic, in-process, no network. Default.
 * - {@link VercelAIProvider} — wraps the `ai` SDK; needs an API key.
 */
export interface AIProvider {
  readonly name: string;
  stream(req: CompletionRequest): AsyncGenerator<AIStreamEvent, void, void>;
  complete(req: CompletionRequest): Promise<AICompleteResult>;
}
