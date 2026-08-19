import { badGateway, tooManyRequests, type HttpError } from '../../utils/index.ts';

export const PIPELINE_ERROR_CODES = ['llm_unavailable', 'llm_invalid_output', 'rate_limited'] as const;

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

  return badGateway(error.code);
}
