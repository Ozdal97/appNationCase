import { z } from 'zod';

export const listChatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
});

export const chatIdParamSchema = z.object({
  chatId: z.string().uuid('chatId must be a valid uuid'),
});

export const historyQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
});

export const createChatBodySchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const completionBodySchema = z.object({
  prompt: z.string().min(1, 'prompt must be non-empty').max(8000),
  systemPrompt: z.string().max(2000).optional(),
});

export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;
export type ChatIdParam = z.infer<typeof chatIdParamSchema>;
export type CompletionBody = z.infer<typeof completionBodySchema>;
