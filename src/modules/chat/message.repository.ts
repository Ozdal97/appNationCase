import { Message, MessageRole, Prisma, PrismaClient } from '@prisma/client';

export interface ListMessagesParams {
  readonly chatId: string;
  /** When set, returns the last N messages. Otherwise returns a full page. */
  readonly take?: number;
  readonly cursor?: string;
}

export interface ListMessagesResult {
  readonly items: ReadonlyArray<Message>;
  readonly nextCursor: string | null;
}

/** Abstract repository contract — services depend on this, not the Prisma class. */
export interface IMessageRepository {
  list(params: ListMessagesParams): Promise<ListMessagesResult>;
  create(data: Prisma.MessageCreateInput): Promise<Message>;
  createMany(rows: ReadonlyArray<Prisma.MessageCreateManyInput>): Promise<Prisma.BatchPayload>;
  recentForContext(chatId: string, limit?: number): Promise<ReadonlyArray<Message>>;
}

export class MessageRepository implements IMessageRepository {
  private static readonly HISTORY_PAGE_SIZE = 100;

  constructor(private readonly prisma: PrismaClient) {}

  async list(params: ListMessagesParams): Promise<ListMessagesResult> {
    const { chatId, take, cursor } = params;

    if (typeof take === 'number') {
      // Last N — order desc, then reverse so the caller gets ascending time order.
      const rows: Message[] = await this.prisma.message.findMany({
        where: { chatId },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return { items: rows.reverse(), nextCursor: null };
    }

    // Full history with optional cursor pagination
    const items: Message[] = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: MessageRepository.HISTORY_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const last: Message | undefined = items[items.length - 1];
    return {
      items,
      nextCursor: items.length === MessageRepository.HISTORY_PAGE_SIZE && last ? last.id : null,
    };
  }

  create(data: Prisma.MessageCreateInput): Promise<Message> {
    return this.prisma.message.create({ data });
  }

  createMany(rows: ReadonlyArray<Prisma.MessageCreateManyInput>): Promise<Prisma.BatchPayload> {
    return this.prisma.message.createMany({ data: rows as Prisma.MessageCreateManyInput[] });
  }

  async recentForContext(chatId: string, limit = 20): Promise<ReadonlyArray<Message>> {
    const rows: Message[] = await this.prisma.message.findMany({
      where: { chatId, role: { in: [MessageRole.USER, MessageRole.ASSISTANT] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }
}
