import { createHash } from 'node:crypto';

/** Hex sha256. Cache keys and fingerprints only — nothing security-bearing. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
