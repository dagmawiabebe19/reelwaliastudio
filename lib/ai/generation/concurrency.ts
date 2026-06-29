export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const poolSize = Math.min(Math.max(limit, 1), queue.length);
  if (!poolSize) return;

  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) break;
        await worker(item);
      }
    }),
  );
}
