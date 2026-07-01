/** Max concurrent sheet angle image calls (OpenAI images.edit). */
export const SHEET_ANGLE_CONCURRENCY = 5;

/** Max concurrent ingredient/sheet generation jobs in setup flows. */
export const SETUP_GENERATION_CONCURRENCY = 4;

/** Max concurrent segment create/bind operations in draft_storyboard. */
export const SEGMENT_SETUP_CONCURRENCY = 6;

export type SettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

/**
 * Run workers with a concurrency cap; one rejection does not abort siblings (Promise.allSettled semantics).
 * Results preserve input order.
 */
export async function runWithConcurrencySettled<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<SettledResult<R>[]> {
  if (!items.length) return [];

  const results: SettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const poolSize = Math.min(Math.max(limit, 1), items.length);

  async function poolWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      try {
        const value = await worker(items[index], index);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => poolWorker()));
  return results;
}

/** Legacy pool — prefer runWithConcurrencySettled for generation work. */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  await runWithConcurrencySettled(items, limit, async (item) => {
    await worker(item);
    return undefined;
  });
}
