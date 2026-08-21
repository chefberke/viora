import { Ratelimit } from '@upstash/ratelimit';
import type { NextFunction, Request, Response } from 'express';

import { redis } from './redis.ts';
import { log, tooManyRequests } from '../utils/index.ts';

/**
 * Per-caller budgets on the routes that cost real money or real quota.
 *
 * These fail OPEN, and that is a deliberate choice rather than a convenience. The limits
 * here protect us from one user; they are not a security boundary, and every route they
 * sit on is already behind a session. If the counter cannot be reached, refusing everyone
 * would turn a cache outage into a full outage — trading a bounded cost for an unbounded
 * one. The provider budget in `entries.off.ts` makes the opposite call for the opposite
 * reason: it protects somebody ELSE from us, so it fails closed. The two live apart on
 * purpose, and neither should be moved next to the other.
 *
 * With no Upstash credentials there is no counter and no limit. `npm run eval` and
 * `npm run check` never build an Express app, so this module simply never loads for them.
 */
const PREFIX = 'viora:rl';

/**
 * How long a blocked caller is refused before the sliding window lets it back in. It is
 * what goes into `Retry-After`, so it has to be the window itself and not a guess.
 */
export interface Budget {
  readonly name: string;
  readonly requests: number;
  readonly windowSeconds: number;
}

/**
 * A parse spends a model call and up to two food-database waves. The real ceiling is the
 * provider's own — 8000 tokens a minute across every user, about three parses — so this
 * is not sized to protect the quota, which one user could exhaust at any rate. It is
 * sized to stop a runaway client: a retry loop on the phone, not a person eating.
 */
export const PARSE_BUDGET: Budget = { name: 'parse', requests: 20, windowSeconds: 60 };

/**
 * Corrections touch no provider — they are a database write and an arithmetic re-price.
 * The budget exists because the ledger is append-only and a loop would grow it forever.
 */
export const CORRECTION_BUDGET: Budget = { name: 'correction', requests: 60, windowSeconds: 60 };

/**
 * A food search is one call to each database per keystroke-settled query. It is the
 * cheapest of the three for us and the most expensive for the databases.
 */
export const SEARCH_BUDGET: Budget = { name: 'search', requests: 30, windowSeconds: 60 };

/**
 * Blocked identities are remembered in the process for the rest of their window, so a
 * client hammering a closed door stops costing a round trip per attempt. Shared across
 * every limiter: the map is keyed by the limiter's own prefix, not just the identity.
 */
const ephemeralCache = new Map<string, number>();

function createLimiter(budget: Budget): Ratelimit | null {
  if (!redis) {
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(budget.requests, `${budget.windowSeconds} s`),
    prefix: `${PREFIX}:${budget.name}`,
    analytics: false,
    ephemeralCache,

    // Past this the counter has not answered and the request is allowed through. Same
    // budget the cache gets, and for the same reason: a limit that costs more latency
    // than the thing it is limiting is not worth enforcing.
    timeout: 300,
  });
}

/**
 * Who the budget is counted against.
 *
 * Every limited route sits behind `requireSession`, so this is the user in practice and
 * the address only when a route is added ahead of it. `req.ip` is the socket address
 * unless the app is told to trust a proxy; taking `x-forwarded-for` unconditionally would
 * let any caller mint a fresh identity per request, which is worse than no limit at all
 * because it looks like one.
 */
function identify(req: Request): string {
  const userId = req.session?.user.id;

  return userId === undefined ? `ip:${req.ip ?? 'unknown'}` : `user:${userId}`;
}

export function rateLimit(budget: Budget): (req: Request, res: Response, next: NextFunction) => void {
  const limiter = createLimiter(budget);

  return (req, res, next) => {
    if (!limiter) {
      next();
      return;
    }

    const identity = identify(req);

    limiter
      .limit(identity)
      .then(({ success, reset }) => {
        if (success) {
          next();
          return;
        }

        // `HttpError` carries a status and a message and nothing else, so the header is
        // set here rather than in the error handler. `reset` is a wall-clock ms stamp;
        // Retry-After is whole seconds, and never less than one.
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

        res.setHeader('Retry-After', String(retryAfter));

        log('rate_limited', {
          id: req.requestId,
          budget: budget.name,
          identity,
          retryAfter,
        });

        next(tooManyRequests());
      })
      .catch(() => {
        // Fail open. The limiter has its own `timeout` for a slow counter; this is for
        // one that answered with an error, and the answer is the same either way.
        next();
      });
  };
}
