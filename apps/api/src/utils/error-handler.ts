import type { NextFunction, Request, Response } from 'express';

import { isProduction } from '../config/index.ts';
import { badRequest, isHttpError, payloadTooLarge } from './http-error.ts';
import { describeError, logError } from './logger.ts';
import type { ErrorResponse } from '../types/index.ts';

/**
 * A failure `express.json()` raised, translated into the taxonomy the rest of the API
 * speaks.
 *
 * Without this every one of them fell through to `unhandled_error` and came back as a
 * 500 — so a client sending a truncated body was told the server had a bug, and the log
 * line the metrics pass reads said the same thing. A body that is too large or not JSON
 * is the caller's mistake and has its own status; neither is unhandled and neither is
 * worth a stack trace.
 */
function readBodyParserError(error: unknown): { status: number; message: string } | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const type = (error as { type?: unknown }).type;

  if (type === 'entity.too.large') {
    return payloadTooLarge();
  }

  if (type === 'entity.parse.failed' || type === 'entity.verify.failed') {
    return badRequest('invalid_json');
  }

  return null;
}

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

  const bodyError = readBodyParserError(error);

  if (bodyError !== null) {
    res.status(bodyError.status).json({ error: bodyError.message });
    return;
  }

  logError('unhandled_error', error, { requestId: req.requestId });
  res.status(500).json({ error: isProduction ? 'internal_error' : describeError(error).message });
}
