import { Database, database } from './database';
import { Logger } from './logger';
import { Config, config } from '../config';
import {
  FeatureFlagService,
  featureFlags,
} from '../feature-flags/feature-flag.service';
import { ChatRepository, IChatRepository } from '../modules/chat/chat.repository';
import {
  IMessageRepository,
  MessageRepository,
} from '../modules/chat/message.repository';
import { ChatService } from '../modules/chat/chat.service';
import { CompletionService } from '../modules/completion/completion.service';
import { AIService } from '../ai/ai.service';
import { AIProvider } from '../ai/providers/ai-provider';
import { MockAIProvider } from '../ai/providers/mock-ai.provider';
import { VercelAIProvider } from '../ai/providers/vercel-ai.provider';
import { CompletionStrategyFactory } from '../feature-flags/strategies/completion-strategy.factory';
import { HistoryStrategyFactory } from '../feature-flags/strategies/history-strategy.factory';
import {
  InMemoryRateLimiterStore,
  RateLimiterStore,
  RedisRateLimiterStore,
} from '../middleware/rate-limit.middleware';

/**
 * Hand-rolled DI container — explicit composition root.
 * Keeps wiring centralised, lets tests substitute fakes without monkey-patching.
 *
 * Field types intentionally use interfaces (IChatRepository, IMessageRepository)
 * for repositories so consumers can't accidentally depend on Prisma-specific
 * methods. Services and strategies are exposed as concrete classes — they ARE
 * the abstraction at their layer.
 */
export interface AppContainer {
  readonly config: Config;
  readonly logger: Logger;
  readonly database: Database;
  readonly featureFlags: FeatureFlagService;
  readonly rateLimiterStore: RateLimiterStore;

  readonly repositories: {
    readonly chat: IChatRepository;
    readonly message: IMessageRepository;
  };

  readonly services: {
    readonly chat: ChatService;
    readonly completion: CompletionService;
    readonly ai: AIService;
  };

  readonly strategies: {
    readonly completion: CompletionStrategyFactory;
    readonly history: HistoryStrategyFactory;
  };
}

let _container: AppContainer | undefined;

export function buildContainer(): AppContainer {
  if (_container) return _container;

  const prisma = database.client;

  // Repositories — exposed via interfaces from here on out.
  const chatRepository: IChatRepository = new ChatRepository(prisma);
  const messageRepository: IMessageRepository = new MessageRepository(prisma);

  // AIProvider is chosen at boot — config.ai.provider drives the Strategy.
  // VercelAIProvider lazy-loads the `ai` SDK so this branch is safe even when
  // the optional packages aren't installed.
  const aiProvider: AIProvider =
    config.get().ai.provider === 'vercel'
      ? new VercelAIProvider(featureFlags, config.get().ai.openaiApiKey ?? '')
      : new MockAIProvider(featureFlags);
  const aiService: AIService = new AIService(aiProvider);

  // Strategy factories.
  const completionStrategyFactory: CompletionStrategyFactory =
    new CompletionStrategyFactory(featureFlags, aiService);
  const historyStrategyFactory: HistoryStrategyFactory = new HistoryStrategyFactory(
    featureFlags,
  );

  // Business services.
  const chatService: ChatService = new ChatService(
    chatRepository,
    messageRepository,
    featureFlags,
    historyStrategyFactory,
  );
  const completionService: CompletionService = new CompletionService(
    chatRepository,
    messageRepository,
    completionStrategyFactory,
  );

  // Rate limiter store — process-local map by default; Redis if requested.
  const rateLimitCfg = config.get().rateLimit;
  const rateLimiterStore: RateLimiterStore =
    rateLimitCfg.store === 'redis' && rateLimitCfg.redisUrl
      ? new RedisRateLimiterStore(rateLimitCfg.redisUrl)
      : new InMemoryRateLimiterStore();

  _container = {
    config: Config.getInstance(),
    logger: Logger.getInstance(),
    database,
    featureFlags,
    rateLimiterStore,
    repositories: { chat: chatRepository, message: messageRepository },
    services: { chat: chatService, completion: completionService, ai: aiService },
    strategies: { completion: completionStrategyFactory, history: historyStrategyFactory },
  };

  return _container;
}

export function getContainer(): AppContainer {
  if (!_container) throw new Error('Container not initialised — call buildContainer() first');
  return _container;
}
