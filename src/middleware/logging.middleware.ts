import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Logger as PinoLogger } from 'pino';
import { logger } from '../core/logger';

/**
 * Structured request/response logger. Logs once on response finish so latency
 * and status are captured in a single event.
 */
export const loggingMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const child: PinoLogger = logger.child({
    requestId: req.requestId,
    method: req.method,
    path: req.path,
  });

  child.info('request received');

  res.on('finish', (): void => {
    const durationMs: number = Date.now() - req.startTime;
    const level: 'error' | 'warn' | 'info' =
      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    child[level](
      {
        status: res.statusCode,
        durationMs,
        clientType: req.clientType,
        userId: req.user?.id,
      },
      'request completed',
    );
  });

  next();
};
