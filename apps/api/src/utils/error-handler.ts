import type { NextFunction, Request, Response } from 'express';

import { isProduction } from '../config/index.ts';
import { HttpError } from './http-error.ts';
import type { ErrorResponse } from '../types/index.ts';

/**
 * Last middleware in the chain. Express 5 forwards rejected promises here on its own, so
 * route code can throw. An `HttpError` message is safe to return; anything else is a bug,
 * logged in full and reduced to `internal_error` so nothing leaks to the client.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error('[api] unhandled error', error);
  res.status(500).json({ error: isProduction ? 'internal_error' : String(error) });
}
