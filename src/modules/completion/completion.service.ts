import { Response } from 'express';
import { Chat, MessageRole, Prisma } from '@prisma/client';
import { IChatRepository } from '../chat/chat.repository';
import { IMessageRepository } from '../chat/message.repository';
import { CompletionStrategyFactory } from '../../feature-flags/strategies/completion-strategy.factory';
import { NotFoundError } from '../../errors/app-error';
import { CompletionRequest } from '../../ai/ai.service';

export interface RunCompletionInput {
  readonly chatId: string;
  readonly userId: string;
  readonly prompt: string;
  readonly systemPrompt?: string;
}

export class CompletionService {
  private static readonly CONTEXT_WINDOW_SIZE = 20;

  constructor(
    private readonly chats: IChatRepository,
    private readonly messages: IMessageRepository,
    private readonly strategies: CompletionStrategyFactory,
  ) {}

  async run(input: RunCompletionInput, res: Response): Promise<void> {
    const chat: Chat | null = await this.chats.findById(input.chatId, input.userId);
    if (!chat) throw new NotFoundError('Chat not found');

    // Persist the user's message immediately so it survives even if streaming fails.
    await this.messages.create({
      chat: { connect: { id: chat.id } },
      role: MessageRole.USER,
      content: input.prompt,
    });

    const history = await this.messages.recentForContext(
      chat.id,
      CompletionService.CONTEXT_WINDOW_SIZE,
    );

    const req: CompletionRequest = {
      chatId: chat.id,
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    };

    const strategy = this.strategies.resolve();
    const { fullText, toolCalls, incomplete } = await strategy.execute(req, res);

    // Persist whatever we have, even if the stream ended early — better partial
    // history than losing the user's prompt cost. Mark it incomplete so callers
    // (or future replay logic) can tell the difference.
    if (fullText) {
      const metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull =
        toolCalls.length > 0 || incomplete
          ? ({ toolCalls, incomplete } as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      await this.messages.create({
        chat: { connect: { id: chat.id } },
        role: MessageRole.ASSISTANT,
        content: fullText,
        metadata,
      });
      await this.chats.touch(chat.id);
    }
  }
}
