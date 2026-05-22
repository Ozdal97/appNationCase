import { NextFunction, Request, RequestHandler, Response } from 'express';
import { featureFlags } from '../feature-flags/feature-flag.service';
import { BooleanFeatureFlagKey } from '../feature-flags/feature-flag.types';
import { FeatureDisabledError } from '../errors/app-error';

/**
 * Route-specific guard: blocks the request if the boolean feature flag is off.
 * Use only with flags whose value type is `boolean`.
 */
export function requireFeature(key: BooleanFeatureFlagKey): RequestHandler {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    if (!featureFlags.isEnabled(key)) {
      return next(new FeatureDisabledError(key));
    }
    next();
  };
}
