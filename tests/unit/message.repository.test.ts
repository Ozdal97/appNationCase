import { Message, MessageRole, PrismaClient } from '@prisma/client';
import { MessageRepository } from '../../src/modules/chat/message.repository';

interface PrismaMessageStub {
  findMany: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
}

function buildPrismaStub(): { prisma: PrismaClient; message: PrismaMessageStub } {
  const message: PrismaMessageStub = {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  };
  return { prisma: { message } as unknown as PrismaClient, message };
}

function makeMessage(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    chatId: 'c1',
    role: MessageRole.USER,
    content: `msg ${id}`,
    metadata: null,
    createdAt: new Date(2024, 0, 1, 0, Number(id.replace(/\D/g, '')) || 0),
    ...overrides,
  };
}

describe('MessageRepository (unit)', () => {
  describe('list with take=N', () => {
    it('fetches last N in desc order and reverses to ascending so callers see chronological flow', async () => {
      const { prisma, message } = buildPrismaStub();
      // Prisma returns desc by createdAt: newest first.
      const desc: Message[] = [makeMessage('3'), makeMessage('2'), makeMessage('1')];
      message.findMany.mockResolvedValueOnce(desc);
      const repo = new MessageRepository(prisma);

      const out = await repo.list({ chatId: 'c1', take: 3 });

      expect(message.findMany).toHaveBeenCalledWith({
        where: { chatId: 'c1' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      expect(out.items.map((m) => m.id)).toEqual(['1', '2', '3']);
      expect(out.nextCursor).toBeNull();
    });
  });

  describe('list (full page)', () => {
    it('returns nextCursor when the page is exactly full (hint that more rows may follow)', async () => {
      const { prisma, message } = buildPrismaStub();
      const page: Message[] = Array.from({ length: 100 }).map((_, i) =>
        makeMessage(String(i)),
      );
      message.findMany.mockResolvedValueOnce(page);
      const repo = new MessageRepository(prisma);

      const out = await repo.list({ chatId: 'c1' });

      expect(out.items).toHaveLength(100);
      expect(out.nextCursor).toBe(page[99]!.id);
    });

    it('returns nextCursor=null when the page is short', async () => {
      const { prisma, message } = buildPrismaStub();
      message.findMany.mockResolvedValueOnce([makeMessage('1'), makeMessage('2')]);
      const repo = new MessageRepository(prisma);

      const out = await repo.list({ chatId: 'c1' });

      expect(out.nextCursor).toBeNull();
    });

    it('forwards the cursor to Prisma with skip:1', async () => {
      const { prisma, message } = buildPrismaStub();
      message.findMany.mockResolvedValueOnce([]);
      const repo = new MessageRepository(prisma);

      await repo.list({ chatId: 'c1', cursor: 'm-99' });

      expect(message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'm-99' }, skip: 1 }),
      );
    });
  });

  describe('recentForContext', () => {
    it('filters to USER + ASSISTANT roles (skips SYSTEM / TOOL) and returns ascending', async () => {
      const { prisma, message } = buildPrismaStub();
      const desc: Message[] = [
        makeMessage('3', { role: MessageRole.ASSISTANT }),
        makeMessage('2', { role: MessageRole.USER }),
        makeMessage('1', { role: MessageRole.ASSISTANT }),
      ];
      message.findMany.mockResolvedValueOnce(desc);
      const repo = new MessageRepository(prisma);

      const out = await repo.recentForContext('c1', 3);

      expect(message.findMany).toHaveBeenCalledWith({
        where: {
          chatId: 'c1',
          role: { in: [MessageRole.USER, MessageRole.ASSISTANT] },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      expect(out.map((m) => m.id)).toEqual(['1', '2', '3']);
    });
  });
});
