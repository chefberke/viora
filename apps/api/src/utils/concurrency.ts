/**
 * Runs `task` over every item with at most `limit` in flight, and returns the results
 * in input order. Rejects on the first task that throws, like `Promise.all`.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  // Each worker pulls the next index until the list runs out; `limit` of them run.
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]!);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());

  await Promise.all(workers);

  return results;
}
