import { badGateway, tooManyRequests, type HttpError } from '../../utils/index.ts';

export const PIPELINE_ERROR_CODES = [
  'llm_unavailable',
  /**
   * The provider answered, and what it said was that we asked wrongly: a revoked key, a
   * model id that does not exist, a plan that does not cover it. Split out from
   * `llm_unavailable` because the two need opposite responses — an outage is waited out
   * and a misconfiguration is fixed — and because collapsing them meant a broken deploy
   * showed up in the traces as an upstream incident.
   */
  'llm_misconfigured',
  'llm_invalid_output',
  'rate_limited',
] as const;

export type PipelineErrorCode = (typeof PIPELINE_ERROR_CODES)[number];

/** A pipeline failure that already knows its client-facing error code. */
export interface PipelineError {
  readonly kind: 'pipeline_error';
  readonly code: PipelineErrorCode;
}

export function pipelineError(code: PipelineErrorCode): PipelineError {
  return { kind: 'pipeline_error', code };
}

export function isPipelineError(value: unknown): value is PipelineError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PipelineError).kind === 'pipeline_error'
  );
}

/** The one place the parse taxonomy becomes a status code. */
export function toHttpError(error: PipelineError): HttpError {
  if (error.code === 'rate_limited') {
    return tooManyRequests();
  }

  // `llm_misconfigured` stays a 502 alongside `llm_unavailable`. From the phone the two
  // are the same event — the server cannot answer and retrying later is the only move —
  // and the value of the split is in the trace's `error_code` and the log line, which is
  // where somebody can act on it. Making it a 500 would tell the client something true
  // and useless while losing the code it already carries.
  return badGateway(error.code);
}
