import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/index.ts';
import { serviceUnavailable } from './http-error.ts';
import { log } from './logger.ts';

/**
 * Answers 503 when a request outlives its budget.
 *
 * The work is deliberately NOT cancelled. A parse that is already running has bought its
 * model call and is about to write the trace row that explains why it was slow; killing it
 * would throw away the one record that makes the timeout diagnosable, and the entry it is
 * halfway through writing would be lost rather than merely late. So this bounds what the
 * CLIENT waits for, not what the server does — the caller gets an answer it can act on,
 * and the pipeline still finishes into the database.
 *
 * `res.headersSent` is the guard that keeps the two from colliding: a response that has
 * already begun is left alone, and a late pipeline simply writes to a socket nobody is
 * reading any more.
 */
export function requestTimeout(req: Request, res: Response, next: NextFunction): void {
  const timer = setTimeout(() => {
    if (res.headersSent) {
      return;
    }

    log('request_timeout', {
      id: req.requestId,
      method: req.method,
      path: req.path,
      budgetMs: env.REQUEST_TIMEOUT_MS,
    });

    // 503 rather than 504: nothing gateway-like is involved, we simply gave up. The
    // header tells a client how long to wait instead of retrying into the same wall.
    const timeout = serviceUnavailable('request_timeout');

    res.setHeader('Retry-After', '5');
    res.status(timeout.status).json({ error: timeout.message });
  }, env.REQUEST_TIMEOUT_MS);

  // `close` rather than `finish`: it fires for an aborted connection too, and a client
  // that hung up is exactly the case where a stray timer would keep the process awake.
  res.on('close', () => clearTimeout(timer));

  next();
}
