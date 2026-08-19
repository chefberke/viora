import type { NextFunction, Request, Response } from 'express';

import { isProduction } from '../config/index.ts';
import { isHttpError } from './http-error.ts';
import { describeError, logError } from './logger.ts';
import type { ErrorResponse } from '../types/index.ts';

/**
 * Last middleware in the chain. Express 5 forwards rejected promises here on its own, so
 * route code can throw. An `HttpError` message is safe to return; anything else is a bug,
 * logged in full and reduced to `internal_error` so nothing leaks to the client.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isHttpError(error)) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  logError('unhandled_error', error, { requestId: req.requestId });
  res.status(500).json({ error: isProduction ? 'internal_error' : describeError(error).message });
}
