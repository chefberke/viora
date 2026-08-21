import { ApiError, NetworkError, TimeoutError } from './api';

/**
 * What to say about a failure, and whether saying "try again" would be honest.
 *
 * Every failure in this app used to render the same red word. That was defensible while
 * the server only really had one way to fail; it is not any more. The API now distinguishes
 * a provider that is metering us, a request that ran out of time, a body we sent that was
 * too large, and a model whose key is wrong — and three of those imply different actions,
 * one of which is "do not retry, you will get the same answer".
 *
 * `retry` is the load-bearing field. A retry offered against a 413 is a button that cannot
 * work, and a retry offered against a timeout is worse than useless: the parse may have
 * completed on the server, so pressing it can log the meal twice.
 */
export interface ErrorCopy {
  /** One sentence for the person. Never a code, never a status. */
  message: string;
  /** Whether the same request is worth sending again. */
  retry: boolean;
  /** The event name this failure is logged under, so the log has the same vocabulary. */
  event: string;
}

const OFFLINE: ErrorCopy = {
  message: 'No connection. This will be saved when you are back online.',
  retry: false,
  event: 'request_offline',
};

const TIMED_OUT: ErrorCopy = {
  // Deliberately not "try again". The server may have finished after we stopped listening,
  // and a second send would be a second meal.
  message: 'That took too long. Pull down to refresh and check before sending it again.',
  retry: false,
  event: 'request_timed_out',
};

const UNKNOWN: ErrorCopy = {
  message: 'Something went wrong.',
  retry: true,
  event: 'request_failed',
};

/** How long to say to wait, from `Retry-After`, rounded up to something a person can hear. */
function waitFor(seconds: number | null): string {
  if (seconds === null || seconds <= 0) {
    return 'in a moment';
  }

  if (seconds < 60) {
    return `in ${Math.ceil(seconds)} seconds`;
  }

  return `in ${Math.ceil(seconds / 60)} minutes`;
}

export function messageForError(error: unknown): ErrorCopy {
  if (error instanceof NetworkError) {
    return OFFLINE;
  }

  if (error instanceof TimeoutError) {
    return TIMED_OUT;
  }

  if (!(error instanceof ApiError)) {
    return UNKNOWN;
  }

  // A body we sent that the server would not take. Retrying sends the identical body, so
  // the button would fail identically; this is the client's own bug and belongs in a log
  // rather than in an instruction the person cannot act on.
  if (error.status === 413 || error.code === 'invalid_json' || error.code === 'invalid_body') {
    return {
      message: 'That entry could not be sent.',
      retry: false,
      event: 'request_rejected',
    };
  }

  if (error.status === 429) {
    return {
      message: `Too many entries at once. Try again ${waitFor(error.retryAfterSeconds)}.`,
      retry: false,
      event: 'rate_limited',
    };
  }

  // The API answers 503 with this code when its own request budget ran out. Same reasoning
  // as the client timeout: the work may have landed.
  if (error.code === 'request_timeout') {
    return TIMED_OUT;
  }

  // Two codes, one sentence. Nobody holding a phone can tell a revoked key from a provider
  // outage, and neither is theirs to fix — but they are different lines in the log, which
  // is where the distinction is worth something.
  if (error.code === 'llm_unavailable' || error.code === 'llm_misconfigured') {
    return {
      message: 'The food reader is unavailable right now.',
      retry: true,
      event: error.code,
    };
  }

  if (error.code === 'llm_invalid_output') {
    return {
      message: 'That line could not be read. Try rewording it.',
      retry: true,
      event: 'llm_invalid_output',
    };
  }

  if (error.status === 401) {
    return { message: 'Please sign in again.', retry: false, event: 'unauthorized' };
  }

  if (error.status >= 500) {
    return { message: 'The server is having trouble.', retry: true, event: 'server_error' };
  }

  return UNKNOWN;
}
