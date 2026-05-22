import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, ZodIssue, ZodSchema } from 'zod';
import { ValidationError } from '../errors/app-error';

type ValidationSource = 'body' | 'query' | 'params';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly code: string;
}

/**
 * Generic validation middleware. Pass a Zod schema and the source it applies
 * to; the parsed (and coerced) value replaces the original on the request.
 *
 * Returns a typed Express RequestHandler so it composes cleanly with router.use().
 */
export function validate<T>(schema: ZodSchema<T>, source: ValidationSource = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details: ReadonlyArray<ValidationIssue> = formatZodError(result.error);
      return next(new ValidationError(`Invalid ${source}`, details));
    }
    // Overwrite with the parsed value (transforms/coercions are visible downstream).
    // The `Request` type does not let us key into a dynamic field with the right
    // narrowing, so a single-line cast at this trust boundary is acceptable.
    (req as Record<ValidationSource, unknown>)[source] = result.data;
    next();
  };
}

function formatZodError(err: ZodError): ReadonlyArray<ValidationIssue> {
  return err.issues.map(
    (issue: ZodIssue): ValidationIssue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }),
  );
}
