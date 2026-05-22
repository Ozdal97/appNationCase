import { Chat, Message } from '@prisma/client';
import { IChatRepository } from './chat.repository';
import { IMessageRepository } from './message.repository';
import { FeatureFlagReader } from '../../feature-flags/feature-flag.types';
import { HistoryStrategyFactory } from '../../feature-flags/strategies/history-strategy.factory';
import { NotFoundError } from '../../errors/app-error';
import { ClientType } from '../../types/express';

/** Mobile clients get a tighter page size — phones don't need 100 chats per page. */
const MOBILE_PAGE_SIZE_CAP = 15;

export interface ListChatsInput {
  readonly userId: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly clientType?: ClientType;
}

export interface ListChatsOutput {
  readonly items: ReadonlyArray<Chat>;
  readonly meta: {
    readonly limit: number;
    readonly nextCursor: string | null;
    readonly appliedFlag: 'PAGINATION_LIMIT';
  };
}

export interface ChatHistoryOutput {
  readonly chat: Chat;
  readonly messages: ReadonlyArray<Message>;
  readonly meta: {
    readonly strategy: 'full' | 'limited';
    readonly full: boolean;
    readonly nextCursor: string | null;
  };
}

/**
 * Business logic for chats. Decides what to read based on feature flags,
 * delegates the actual read to repositories via injected strategies.
 *
 * Depends only on abstractions (IChatRepository, IMessageRepository,
 * FeatureFlagReader) — never on Prisma directly.
 */
export class ChatService {
  constructor(
    private readonly chats: IChatRepository,
    private readonly messages: IMessageRepository,
    private readonly flags: FeatureFlagReader,
    private readonly historyStrategies: HistoryStrategyFactory,
  ) {}

  async createChat(userId: string, title?: string): Promise<Chat> {
    const fallbackTitle = `New chat — ${new Date().toLocaleString()}`;
    return this.chats.create({
      title: (title?.trim() || fallbackTitle).slice(0, 120),
      user: { connect: { id: userId } },
    });
  }

  async listChats(input: ListChatsInput): Promise<ListChatsOutput> {
    const flagLimit: number = this.flags.get('PAGINATION_LIMIT');
    // Caller-provided limit is bounded by the flag value; mobile clients are
    // additionally capped to a smaller window regardless of the flag.
    const effectiveCap: number =
      input.clientType === 'mobile' ? Math.min(flagLimit, MOBILE_PAGE_SIZE_CAP) : flagLimit;
    const limit: number = Math.min(input.limit ?? effectiveCap, effectiveCap);

    const { items, nextCursor } = await this.chats.list({
      userId: input.userId,
      take: limit,
      cursor: input.cursor,
    });

    return {
      items,
      meta: { limit, nextCursor, appliedFlag: 'PAGINATION_LIMIT' },
    };
  }

  async getHistory(
    chatId: string,
    userId: string,
    cursor?: string,
    clientType?: ClientType,
  ): Promise<ChatHistoryOutput> {
    const chat: Chat | null = await this.chats.findById(chatId, userId);
    if (!chat) throw new NotFoundError('Chat not found');

    const strategy = this.historyStrategies.resolve(clientType);
    const query = strategy.resolveQuery();
    const { items, nextCursor } = await this.messages.list({
      chatId,
      take: query.take,
      cursor,
    });

    return {
      chat,
      messages: items,
      meta: {
        strategy: strategy.name,
        full: strategy.name === 'full',
        nextCursor,
      },
    };
  }
}
