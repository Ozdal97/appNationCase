import { Chat, Prisma, PrismaClient } from '@prisma/client';

export interface ListChatsParams {
  readonly userId: string;
  readonly take: number;
  /** Chat id used as cursor. The repository skips past this id on the next page. */
  readonly cursor?: string;
}

export interface ListChatsResult {
  readonly items: ReadonlyArray<Chat>;
  readonly nextCursor: string | null;
}

/**
 * Abstract repository contract. Services depend on this interface (DIP);
 * the concrete `ChatRepository` is one of potentially many implementations
 * (Postgres now, perhaps Redis-cache-fronted later, in-memory for tests).
 */
export interface IChatRepository {
  list(params: ListChatsParams): Promise<ListChatsResult>;
  findById(id: string, userId: string): Promise<Chat | null>;
  create(data: Prisma.ChatCreateInput): Promise<Chat>;
  touch(id: string): Promise<Chat>;
}

/**
 * Prisma-backed repository. Pure data access — no business rules, no flags.
 */
export class ChatRepository implements IChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(params: ListChatsParams): Promise<ListChatsResult> {
    const { userId, take, cursor } = params;
    // Cursor-based pagination — stable under inserts, indexed by [userId, updatedAt].
    const items: Chat[] = await this.prisma.chat.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1, // fetch one extra to know if there's another page
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > take) {
      items.pop(); // discard the lookahead row
      // Cursor must be the LAST returned row: the next page uses
      // `cursor: { id }, skip: 1` which skips past this id.
      nextCursor = items[items.length - 1]?.id ?? null;
    }
    return { items, nextCursor };
  }

  findById(id: string, userId: string): Promise<Chat | null> {
    return this.prisma.chat.findFirst({ where: { id, userId } });
  }

  create(data: Prisma.ChatCreateInput): Promise<Chat> {
    return this.prisma.chat.create({ data });
  }

  touch(id: string): Promise<Chat> {
    return this.prisma.chat.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }
}
