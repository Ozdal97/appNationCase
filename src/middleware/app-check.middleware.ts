import { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config';
import { UnauthorizedError } from '../errors/app-error';

const MIN_APP_CHECK_TOKEN_LENGTH = 4;

/**
 * Mocked Firebase App Check. In production this would verify a token issued by
 * the Firebase SDK on the client. Here we accept any non-empty token when the
 * flag is enabled and skip entirely otherwise.
 */
export const appCheckMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!config.get().security.firebaseAppCheckEnabled) {
    req.appCheckVerified = false;
    return next();
  }
  const token: string | undefined = req.header('x-firebase-appcheck');
  if (!token || token.length < MIN_APP_CHECK_TOKEN_LENGTH) {
    return next(new UnauthorizedError('Firebase App Check token missing or invalid'));
  }
  req.appCheckVerified = true;
  next();
};
