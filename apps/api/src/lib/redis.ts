import { Redis } from '@upstash/redis';

import { env } from '../config/index.ts';
import { log, logError } from '../utils/index.ts';

/**
 * How long any one command may take before it is abandoned as a miss. The cache exists to
 * save a second, so a cache that costs one is worse than no cache: past this the parse is
 * cheaper paid for outright.
 */
const COMMAND_TIMEOUT_MS = 300;

/**
 * The shared Upstash client. It speaks HTTP rather than the Redis wire protocol, which is
 * why nothing here connects, disconnects or listens for events: every command is one
 * request that either answers or does not. That also means no socket is held open, so a
 * script that imports this module no longer has to close it to let the process exit.
 *
 * With no credentials the client is never created and every call below is an immediate
 * no-op — the contract `npm run eval` depends on, since it runs with no keys at all.
 */
export const redis = env.hasRedis
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,

      // The SDK JSON-parses every reply by default. Everything stored here is a string
      // this module's callers validate themselves — `entries.cache.ts` runs the model's
      // own generation through `validateLlmOutput`, and the food list through a per-row
      // reader — so parsing it early would hand them an object where they expect text and
      // throw away the one place the shape is actually checked.
      automaticDeserialization: false,

      // A factory, not a single signal: each request gets its own deadline. A shared
      // AbortSignal would abort once and then abort everything after it forever.
      signal: () => AbortSignal.timeout(COMMAND_TIMEOUT_MS),

      // The default is five. Retrying a cache read is spending the caller's latency on
      // something whose failure is already free — the next line simply misses.
      retry: { retries: 1 },

      keepAlive: true,
      enableTelemetry: false,
    })
  : null;

/**
 * One line per outage, not one per failed command.
 *
 * The old ioredis client raised `error` and `ready` events and this latch rode on those.
 * An HTTP client has neither, so the same two log lines are derived from the commands
 * themselves: the first failure after a healthy stretch says so, and the first success
 * after a bad one says so. The event names are unchanged on purpose — they are what the
 * metrics pass reads.
 */
let degraded = false;

function noteFailure(error: unknown): void {
  if (!degraded) {
    degraded = true;
    logError('redis_degraded', error);
  }
}

function noteSuccess(): void {
  if (degraded) {
    degraded = false;
    log('redis_recovered');
  }
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get<string>(key);

    noteSuccess();

    return value;
  } catch (error) {
    noteFailure(error);

    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    await redis.set(key, value, { ex: ttlSeconds });

    noteSuccess();
  } catch (error) {
    // Nothing to do beyond the log: the next read simply misses.
    noteFailure(error);
  }
}

/**
 * Takes one slot of a budget shared by every instance of this API, and refuses when it
 * cannot tell whether the slot is there.
 *
 * **This fails CLOSED, and the two rate limits in this codebase deliberately disagree.**
 * `lib/ratelimit.ts` bounds what one user may spend of OURS and lets a request through
 * when the counter is unreachable, because a cache outage must not become an app outage.
 * This one bounds what all of us together may spend of SOMEBODY ELSE'S — Open Food Facts
 * allows ten searches a minute per IP and every user here shares one address. Guessing
 * "probably fine" during an outage spends a stranger's quota and gets the address blocked.
 * A refused slot costs one flagged estimate; a blocked address costs the provider outright.
 *
 * The one exception is having no cache configured at all. Then there is nothing to share
 * state through, the caller's own in-process window is the entire budget, and refusing
 * every lookup would take the provider away for no gain — so this returns true, which is
 * exactly how a single instance behaved before any of this existed.
 *
 * The window rides in the key rather than in a TTL that gets pushed forward on every hit.
 * Refreshing a TTL per request turns "eight a minute" into "eight, then silence until a
 * quiet minute passes", which locks out precisely the traffic it is meant to pace. A key
 * per window bucket expires on its own and needs no EXPIRE … NX.
 */
export async function takeSharedSlot(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!redis) {
    return true;
  }

  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `viora:budget:${bucket}:${window}`;

  try {
    const used = await redis.incr(key);

    // Twice the window, so the key outlives its own bucket and a clock a second out of
    // step cannot read a counter that has already been collected.
    if (used === 1) {
      await redis.expire(key, windowSeconds * 2);
    }

    noteSuccess();

    return used <= limit;
  } catch (error) {
    noteFailure(error);

    return false;
  }
}
