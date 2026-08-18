/** An error that carries its HTTP status. Handlers throw it instead of writing a response. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function badRequest(message = 'bad_request'): HttpError {
  return new HttpError(400, message);
}

export function unauthorized(message = 'unauthorized'): HttpError {
  return new HttpError(401, message);
}

export function notFound(message = 'not_found'): HttpError {
  return new HttpError(404, message);
}
