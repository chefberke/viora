import type { Session } from '../lib/auth.ts';

// Optional: only requests that passed through `requireSession` carry a session.
declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export {};
