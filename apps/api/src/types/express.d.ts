import type { Session } from '../lib/auth.ts';

declare global {
  namespace Express {
    interface Request {
      // Optional: only requests that passed through `requireSession` carry a session.
      session?: Session;
      /** Set for every request by the `requestId` middleware, first in the chain. */
      requestId: string;
    }
  }
}

export {};
