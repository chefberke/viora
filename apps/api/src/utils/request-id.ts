import type { NextFunction, Request, Response } from 'express';

import { log } from './logger.ts';

/**
 * Tags every request and its log line with one id, echoed back as `x-request-id`.
 * A parse trace stores the same id, so a slow or wrong entry can be walked back
 * from the phone to the exact pipeline run.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);

  const startedAt = performance.now();

  res.on('finish', () => {
    log('request', {
      id: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });

  next();
}
