import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/app-error';
import { logger } from '../core/logger';

interface ErrorLogPayload extends Record<string, unknown> {
  readonly requestId: string;
  readonly code: string;
  readonly statusCode: number;
  readonly path: string;
  readonly method: string;
  readonly userId?: string;
  readonly stack?: string;
}

/**
 * Terminal error handler. Must be registered LAST in the middleware chain.
 * Produces a consistent error envelope and hides internals in production.
 */
export const errorHandlerMiddleware: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const appErr: AppError =
    err instanceof AppError
      ? err
      : new AppError(
          err instanceof Error ? err.message : 'Internal server error',
          500,
          'INTERNAL_ERROR',
          undefined,
          false,
        );

  const logPayload: ErrorLogPayload = {
    requestId: req.requestId,
    code: appErr.code,
    statusCode: appErr.statusCode,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    stack: appErr.stack,
  };
  if (appErr.statusCode >= 500) logger.error(appErr.message, logPayload);
  else logger.warn(appErr.message, logPayload);

  // If the response was already started (e.g. SSE), we can only end the stream.
  if (res.headersSent) {
    try {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          code: appErr.code,
          message: appErr.message,
        })}\n\n`,
      );
    } catch {
      // socket may already be closed
    }
    res.end();
    return;
  }

  res.status(appErr.statusCode).json({
    error: {
      code: appErr.code,
      message: appErr.message,
      details: appErr.details,
      requestId: req.requestId,
    },
  });
};

/** 404 fallback for unmatched routes. */
export const notFoundHandler: RequestHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.requestId,
    },
  });
};

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * async route wrapper — forwards rejected promises to next() so individual
 * controllers can be plain async functions without try/catch boilerplate.
 */
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
