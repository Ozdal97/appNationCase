import { ChatService } from '../src/modules/chat/chat.service';
import { FeatureFlagService } from '../src/feature-flags/feature-flag.service';
import { HistoryStrategyFactory } from '../src/feature-flags/strategies/history-strategy.factory';

describe('ChatService', () => {
  const flags = FeatureFlagService.getInstance();

  const sampleChat = { id: 'c1', userId: 'u1', title: 't', createdAt: new Date(), updatedAt: new Date() };
  const sampleMessages = Array.from({ length: 30 }).map((_, i) => ({
    id: `m${i}`,
    chatId: 'c1',
    role: 'USER',
    content: `msg ${i}`,
    metadata: null,
    createdAt: new Date(2024, 0, 1, 0, i),
  }));

  const chatRepoStub = {
    list: jest.fn(async ({ take }: { take: number }) => ({
      items: [sampleChat],
      nextCursor: take === 1 ? 'next' : null,
    })),
    findById: jest.fn(async () => sampleChat),
    create: jest.fn(),
    touch: jest.fn(),
  };

  const messageRepoStub = {
    list: jest.fn(async ({ take }: { take?: number }) => ({
      items: typeof take === 'number' ? sampleMessages.slice(-take) : sampleMessages,
      nextCursor: null,
    })),
    create: jest.fn(),
    createMany: jest.fn(),
    recentForContext: jest.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ChatService(chatRepoStub as any, messageRepoStub as any, flags, new HistoryStrategyFactory(flags));

  it('caps caller-provided limit to PAGINATION_LIMIT flag', async () => {
    flags.set('PAGINATION_LIMIT', 20);
    await service.listChats({ userId: 'u1', limit: 99 });
    expect(chatRepoStub.list).toHaveBeenLastCalledWith(expect.objectContaining({ take: 20 }));
  });

  it('falls back to flag limit when no limit supplied', async () => {
    flags.set('PAGINATION_LIMIT', 30);
    await service.listChats({ userId: 'u1' });
    expect(chatRepoStub.list).toHaveBeenLastCalledWith(expect.objectContaining({ take: 30 }));
  });

  it('uses full history strategy when CHAT_HISTORY_ENABLED is true', async () => {
    flags.set('CHAT_HISTORY_ENABLED', true);
    const out = await service.getHistory('c1', 'u1');
    expect(out.meta.strategy).toBe('full');
    expect(messageRepoStub.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: 'c1', take: undefined }),
    );
  });

  it('uses limited history strategy when CHAT_HISTORY_ENABLED is false', async () => {
    flags.set('CHAT_HISTORY_ENABLED', false);
    flags.set('CHAT_HISTORY_LIMITED_COUNT', 5);
    const out = await service.getHistory('c1', 'u1');
    expect(out.meta.strategy).toBe('limited');
    expect(messageRepoStub.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: 'c1', take: 5 }),
    );
  });
});
