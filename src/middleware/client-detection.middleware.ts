import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ClientType } from '../types/express';

const EXPLICIT_CLIENT_TYPES: ReadonlySet<ClientType> = new Set<ClientType>([
  'web',
  'mobile',
  'desktop',
]);

/**
 * Detects client type from headers. The explicit `x-client-type` header wins;
 * otherwise we fall back to a User-Agent sniff. Useful for tailoring features
 * (e.g. limited history on mobile).
 */
export const clientDetectionMiddleware: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const explicit: string | undefined = req.header('x-client-type')?.toLowerCase();
  if (explicit && EXPLICIT_CLIENT_TYPES.has(explicit as ClientType)) {
    req.clientType = explicit as ClientType;
    return next();
  }

  const userAgent: string = (req.header('user-agent') ?? '').toLowerCase();
  req.clientType = detectFromUserAgent(userAgent);
  next();
};

function detectFromUserAgent(userAgent: string): ClientType {
  if (/android|iphone|ipad|mobile/.test(userAgent)) return 'mobile';
  if (/electron/.test(userAgent)) return 'desktop';
  if (/mozilla|chrome|safari|firefox/.test(userAgent)) return 'web';
  return 'unknown';
}
