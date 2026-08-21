import type { NextFunction, Request, Response } from 'express';

import { log } from './logger.ts';

/**
 * The id an incoming `x-request-id` is allowed to be. Nothing else is taken.
 *
 * This value is written into `parse_traces.request_id` and into every log line for the
 * request, and both are read by machines. An unvalidated header would let a caller choose
 * what appears in the log — a newline and a fabricated JSON object is all it takes to
 * write a log entry that never happened — and would let it collide two unrelated parses
 * onto one id. A UUID is narrow enough that neither is possible, and it is the shape
 * this server generates anyway.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tags every request and its log line with one id, echoed back as `x-request-id`.
 * A parse trace stores the same id, so a slow or wrong entry can be walked back
 * from the phone to the exact pipeline run.
 *
 * A caller that already has an id — a mobile client retrying, or a proxy that traces —
 * keeps it, so one user action is one id across every hop rather than a new one per
 * server. Anything that is not a UUID is discarded rather than rejected: a malformed
 * trace header is not a reason to fail a request that is otherwise fine.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];

  req.requestId =
    typeof incoming === 'string' && UUID.test(incoming) ? incoming : crypto.randomUUID();

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
