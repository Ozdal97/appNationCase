import { Chat, PrismaClient } from '@prisma/client';
import { ChatRepository } from '../../src/modules/chat/chat.repository';

interface PrismaChatStub {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
}

function buildPrismaStub(): { prisma: PrismaClient; chat: PrismaChatStub } {
  const chat: PrismaChatStub = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  return { prisma: { chat } as unknown as PrismaClient, chat };
}

function makeChat(id: string, overrides: Partial<Chat> = {}): Chat {
  return {
    id,
    title: `chat ${id}`,
    userId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ChatRepository (unit)', () => {
  describe('list', () => {
    it('returns the requested page and sets nextCursor to the LAST returned id (not the lookahead row)', async () => {
      const { prisma, chat } = buildPrismaStub();
      // Repository asks for take + 1 rows. Return 6 to simulate "there is a next page".
      const rows: Chat[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => makeChat(id));
      chat.findMany.mockResolvedValueOnce([...rows]);
      const repo = new ChatRepository(prisma);

      const out = await repo.list({ userId: 'u1', take: 5 });

      expect(chat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          take: 6, // take + 1
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(out.items.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      // Cursor must be the LAST RETURNED row (e), not the lookahead (f).
      // Next page uses `cursor: {id: e}, skip: 1` to start at f — no row is lost.
      expect(out.nextCursor).toBe('e');
    });

    it('returns nextCursor=null when fewer than take rows come back', async () => {
      const { prisma, chat } = buildPrismaStub();
      chat.findMany.mockResolvedValueOnce([makeChat('a'), makeChat('b')]);
      const repo = new ChatRepository(prisma);

      const out = await repo.list({ userId: 'u1', take: 5 });

      expect(out.items).toHaveLength(2);
      expect(out.nextCursor).toBeNull();
    });

    it('passes cursor + skip:1 to Prisma so the next page starts past the cursor row', async () => {
      const { prisma, chat } = buildPrismaStub();
      chat.findMany.mockResolvedValueOnce([makeChat('x')]);
      const repo = new ChatRepository(prisma);

      await repo.list({ userId: 'u1', take: 5, cursor: 'cursor-id' });

      expect(chat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
      );
    });
  });

  describe('findById', () => {
    it('scopes the lookup to the supplied userId so users cannot read each others chats', async () => {
      const { prisma, chat } = buildPrismaStub();
      chat.findFirst.mockResolvedValueOnce(null);
      const repo = new ChatRepository(prisma);

      await repo.findById('c1', 'u1');

      expect(chat.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', userId: 'u1' } });
    });
  });

  describe('touch', () => {
    it('updates updatedAt for the chat id', async () => {
      const { prisma, chat } = buildPrismaStub();
      chat.update.mockResolvedValueOnce(makeChat('c1'));
      const repo = new ChatRepository(prisma);

      await repo.touch('c1');

      expect(chat.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ updatedAt: expect.any(Date) }),
      });
    });
  });
});
