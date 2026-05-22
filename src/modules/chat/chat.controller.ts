import { Request, Response } from 'express';
import { Chat } from '@prisma/client';
import { ChatHistoryOutput, ChatService, ListChatsOutput } from './chat.service';
import { UnauthorizedError } from '../../errors/app-error';

interface CreateChatBody {
  readonly title?: string;
}

interface ListChatsQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

interface ChatIdParam {
  readonly chatId: string;
}

interface HistoryQuery {
  readonly cursor?: string;
}

/**
 * Thin HTTP layer. Pulls inputs off the request, calls the service, shapes
 * the response. No DB access, no flag inspection, no business rules here.
 */
export class ChatController {
  constructor(private readonly chats: ChatService) {}

  createChat = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const { title } = (req.body ?? {}) as CreateChatBody;
    const chat: Chat = await this.chats.createChat(req.user.id, title);
    res.status(201).json({ data: chat });
  };

  listChats = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const { limit, cursor } = req.query as ListChatsQuery;

    const result: ListChatsOutput = await this.chats.listChats({
      userId: req.user.id,
      limit,
      cursor,
      clientType: req.clientType,
    });

    res.status(200).json({
      data: result.items,
      meta: result.meta,
    });
  };

  getHistory = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const { chatId } = req.params as unknown as ChatIdParam;
    const { cursor } = req.query as HistoryQuery;

    const result: ChatHistoryOutput = await this.chats.getHistory(
      chatId,
      req.user.id,
      cursor,
      req.clientType,
    );

    res.status(200).json({
      data: {
        chat: result.chat,
        messages: result.messages,
      },
      meta: result.meta,
    });
  };
}
