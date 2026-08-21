import { log, logError } from './logger.ts';

export interface CircuitBreaker {
  /** False while the circuit is open: do not call, fail immediately. */
  allow(): boolean;
  recordSuccess(): void;
  recordFailure(error?: unknown): void;
  /** Opens it now, whatever the count. For a failure that cannot be transient. */
  trip(error?: unknown): void;
}

export interface CircuitOptions {
  /** Consecutive failures that open the circuit. */
  failures: number;
  /** How long it stays open before one call is let through to test the water. */
  openMs: number;
}

/**
 * Stops calling a provider that has stopped answering.
 *
 * A retry loop is the right answer to one failed call and the wrong answer to a provider
 * that is down: every request then pays the full retry budget to reach a conclusion the
 * previous request already reached. This holds that conclusion for a while — after
 * `failures` in a row the circuit opens, and callers are refused without a round trip
 * until `openMs` has passed, at which point exactly one call is allowed through to find
 * out whether anything changed.
 *
 * It is per process, and deliberately so. A shared breaker would need a round trip to the
 * thing that is already the slow part of a bad minute, and the state it holds is worth
 * almost nothing across instances: an outage one instance can see, the others see too,
 * within one failure each.
 */
export function createCircuitBreaker(name: string, options: CircuitOptions): CircuitBreaker {
  let consecutiveFailures = 0;
  let openedAt: number | null = null;

  function close(): void {
    if (openedAt !== null) {
      openedAt = null;
      log('circuit_closed', { name });
    }

    consecutiveFailures = 0;
  }

  function open(error?: unknown): void {
    if (openedAt !== null) {
      return;
    }

    openedAt = Date.now();
    logError('circuit_open', error ?? new Error(name), { name, openMs: options.openMs });
  }

  return {
    allow(): boolean {
      if (openedAt === null) {
        return true;
      }

      // Half-open: the probe is allowed by clearing the timestamp, so a second caller in
      // the same instant is refused rather than joining a stampede. Whatever the probe
      // does next — success or failure — puts the circuit back into a settled state.
      if (Date.now() - openedAt >= options.openMs) {
        openedAt = null;
        return true;
      }

      return false;
    },

    recordSuccess: close,

    recordFailure(error?: unknown): void {
      consecutiveFailures += 1;

      if (consecutiveFailures >= options.failures) {
        open(error);
      }
    },

    trip(error?: unknown): void {
      consecutiveFailures = options.failures;
      open(error);
    },
  };
}
