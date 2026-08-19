/**
 * An error that carries its HTTP status. Handlers throw it instead of writing a
 * response. It is a tagged plain object rather than an `Error` subclass: the handler
 * only ever reads `status` and `message`, and a tag check works across module
 * boundaries where `instanceof` can quietly fail.
 */
export interface HttpError {
  readonly kind: 'http_error';
  readonly status: number;
  readonly message: string;
}

function httpError(status: number, message: string): HttpError {
  return { kind: 'http_error', status, message };
}

export function isHttpError(value: unknown): value is HttpError {
  return (
    typeof value === 'object' && value !== null && (value as HttpError).kind === 'http_error'
  );
}

export function badRequest(message = 'bad_request'): HttpError {
  return httpError(400, message);
}

export function unauthorized(message = 'unauthorized'): HttpError {
  return httpError(401, message);
}

export function notFound(message = 'not_found'): HttpError {
  return httpError(404, message);
}

export function conflict(message = 'conflict'): HttpError {
  return httpError(409, message);
}

export function tooManyRequests(message = 'rate_limited'): HttpError {
  return httpError(429, message);
}

export function badGateway(message = 'bad_gateway'): HttpError {
  return httpError(502, message);
}
