/** Numeric helpers shared by every module. Kept here so no feature re-declares them. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** One decimal — the precision macros are stored and shown with. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Two decimals — the precision confidence scores are stored with. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
