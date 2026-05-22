import { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';

const MAX_INCOMING_REQUEST_ID_LENGTH = 64;

/**
 * First middleware in the chain. Assigns a request id (honouring X-Request-Id
 * if the client sent one) and records the start time for downstream timing.
 */
export const requestContextMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming: string | undefined = req.header('x-request-id');
  req.requestId =
    incoming && incoming.length <= MAX_INCOMING_REQUEST_ID_LENGTH ? incoming : randomUUID();
  req.startTime = Date.now();
  res.setHeader('x-request-id', req.requestId);
  next();
};
