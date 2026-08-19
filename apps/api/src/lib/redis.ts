import { Redis } from 'ioredis';

import { env } from '../config/index.ts';
import { log, logError } from '../utils/index.ts';

/**
 * Cache access that can never take a request down: every failure degrades to a miss.
 * With no REDIS_URL the client is never created and each call is an immediate no-op.
 */
const client = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      commandTimeout: 300,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 1000, 15_000),
    })
  : null;

// ioredis emits an error per failed attempt; one line per outage is enough.
let degraded = false;

client?.on('error', (error) => {
  if (!degraded) {
    degraded = true;
    logError('redis_degraded', error);
  }
});

client?.on('ready', () => {
  if (degraded) {
    degraded = false;
    log('redis_recovered');
  }
});

// Connect now rather than on the first command: with the offline queue off, commands
// sent while still connecting fail fast, so the first parse after a boot would miss.
void client?.connect().catch(() => {});

export async function cacheGet(key: string): Promise<string | null> {
  if (!client) {
    return null;
  }

  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.set(key, value, 'EX', ttlSeconds);
  } catch {
    // Nothing to do: the next read simply misses.
  }
}

export async function closeRedis(): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
