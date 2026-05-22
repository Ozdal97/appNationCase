import jwt from 'jsonwebtoken';
import { Chat, Message, MessageRole } from '@prisma/client';

import { createApp } from '../../src/app';
import { config } from '../../src/config';
import { logger } from '../../src/core/logger';
import { database } from '../../src/core/database';
import { featureFlags } from '../../src/feature-flags/feature-flag.service';
import { AppContainer } from '../../src/core/container';
import { ChatService } from '../../src/modules/chat/chat.service';
import { CompletionService } from '../../src/modules/completion/completion.service';
import { AIService } from '../../src/ai/ai.service';
import { MockAIProvider } from '../../src/ai/providers/mock-ai.provider';
import { CompletionStrategyFactory } from '../../src/feature-flags/strategies/completion-strategy.factory';
import { HistoryStrategyFactory } from '../../src/feature-flags/strategies/history-strategy.factory';
import { ChatRepository } from '../../src/modules/chat/chat.repository';
import { MessageRepository } from '../../src/modules/chat/message.repository';
import { InMemoryRateLimiterStore } from '../../src/middleware/rate-limit.middleware';

/**
 * Stub repositories that satisfy the real Repository class shapes so the real
 * Service/Strategy code can run end-to-end through Express without a Postgres.
 */
export interface FakeData {
  chats: Chat[];
  messagesByChatId: Map<string, Message[]>;
}

export function makeFakeData(userId: string): FakeData {
  const now = new Date();
  const chat: Chat = {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Sample',
    userId,
    createdAt: now,
    updatedAt: now,
  };
  const messages: Message[] = [
    {
      id: '22222222-2222-2222-2222-222222222222',
      chatId: chat.id,
      role: MessageRole.USER,
      content: 'hi',
      metadata: null,
      createdAt: now,
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      chatId: chat.id,
      role: MessageRole.ASSISTANT,
      content: 'hello back',
      metadata: null,
      createdAt: new Date(now.getTime() + 1000),
    },
  ];
  return {
    chats: [chat],
    messagesByChatId: new Map([[chat.id, messages]]),
  };
}

export function buildFakeContainer(data: FakeData): AppContainer {
  // We construct the real ChatRepository instance but never let it touch Prisma;
  // instead we override its methods with in-memory stubs. This preserves typing
  // without needing to re-implement the class shape.
  const chatRepo = new ChatRepository({} as never);
  chatRepo.list = jest.fn(async ({ userId, take, cursor }) => {
    const userChats = data.chats.filter((c) => c.userId === userId);
    let start = 0;
    if (cursor) {
      const idx = userChats.findIndex((c) => c.id === cursor);
      if (idx >= 0) start = idx + 1;
    }
    const slice = userChats.slice(start, start + take + 1);
    const nextCursor = slice.length > take ? slice[take - 1]!.id : null;
    return { items: slice.slice(0, take), nextCursor };
  });
  chatRepo.findById = jest.fn(async (id, userId) =>
    data.chats.find((c) => c.id === id && c.userId === userId) ?? null,
  );
  chatRepo.create = jest.fn(async (input) => {
    const userConn = input.user as { connect: { id: string } };
    const created: Chat = {
      id: `chat-${Math.random().toString(16).slice(2)}`,
      title: input.title as string,
      userId: userConn.connect.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    data.chats.unshift(created);
    return created;
  });
  chatRepo.touch = jest.fn(async (id) => data.chats.find((c) => c.id === id)!);

  const messageRepo = new MessageRepository({} as never);
  messageRepo.list = jest.fn(async ({ chatId, take }) => {
    const all = data.messagesByChatId.get(chatId) ?? [];
    if (typeof take === 'number') {
      return { items: all.slice(-take), nextCursor: null };
    }
    return { items: all, nextCursor: null };
  });
  messageRepo.create = jest.fn(async (input) => {
    const created: Message = {
      id: `m-${Math.random().toString(16).slice(2)}`,
      chatId: (input.chat as { connect: { id: string } }).connect.id,
      role: input.role as MessageRole,
      content: input.content as string,
      metadata: null,
      createdAt: new Date(),
    };
    const list = data.messagesByChatId.get(created.chatId) ?? [];
    list.push(created);
    data.messagesByChatId.set(created.chatId, list);
    return created;
  });
  messageRepo.createMany = jest.fn(async () => ({ count: 0 }));
  messageRepo.recentForContext = jest.fn(async (chatId, limit = 20) => {
    const all = data.messagesByChatId.get(chatId) ?? [];
    return all.slice(-limit);
  });

  const ai = new AIService(new MockAIProvider(featureFlags));
  const completionStrategies = new CompletionStrategyFactory(featureFlags, ai);
  const historyStrategies = new HistoryStrategyFactory(featureFlags);

  return {
    config,
    logger,
    database,
    featureFlags,
    rateLimiterStore: new InMemoryRateLimiterStore(),
    repositories: { chat: chatRepo, message: messageRepo },
    services: {
      chat: new ChatService(chatRepo, messageRepo, featureFlags, historyStrategies),
      completion: new CompletionService(chatRepo, messageRepo, completionStrategies),
      ai,
    },
    strategies: { completion: completionStrategies, history: historyStrategies },
  };
}

export function buildTestApp(data?: FakeData) {
  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const d = data ?? makeFakeData(userId);
  return { app: createApp(buildFakeContainer(d)), data: d, userId };
}

export function signJwt(payload: { sub: string; email?: string; tier?: string }) {
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email ?? 'tester@appnation.test',
      tier: payload.tier ?? 'ENTERPRISE',
    },
    config.get().security.jwtSecret,
    { expiresIn: '1h' },
  );
}
