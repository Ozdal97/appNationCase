import { Request, Response } from 'express';
import { CompletionService } from './completion.service';
import { UnauthorizedError } from '../../errors/app-error';

interface ChatIdParam {
  readonly chatId: string;
}

interface CompletionBody {
  readonly prompt: string;
  readonly systemPrompt?: string;
}

export class CompletionController {
  constructor(private readonly completion: CompletionService) {}

  run = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new UnauthorizedError();
    const { chatId } = req.params as unknown as ChatIdParam;
    const { prompt, systemPrompt } = req.body as CompletionBody;

    await this.completion.run(
      { chatId, userId: req.user.id, prompt, systemPrompt },
      res,
    );
  };
}
