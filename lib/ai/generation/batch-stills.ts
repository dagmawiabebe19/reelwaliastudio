export type TakeStatusSummary = {
  media_type: string;
  status: string;
};

/** True when a scene has no ready or pending image still. */
export function sceneNeedsImageStill(takes: TakeStatusSummary[]): boolean {
  const images = takes.filter((take) => take.media_type === "image");
  const hasReady = images.some((take) => take.status === "ready");
  const hasPending = images.some((take) => take.status === "pending");
  return !hasReady && !hasPending;
}

export function countScenesNeedingStills(
  scenes: Array<{ id: string; status: string; act_label: string | null }>,
  takesByScene: Record<string, TakeStatusSummary[]>,
  actLabel: string,
): number {
  return scenes.filter(
    (scene) =>
      scene.status !== "archived" &&
      (scene.act_label ?? "Storyboard-only") === actLabel &&
      sceneNeedsImageStill(takesByScene[scene.id] ?? []),
  ).length;
}

export function sceneHasPendingImageStill(takes: TakeStatusSummary[]): boolean {
  return takes.some((take) => take.media_type === "image" && take.status === "pending");
}

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
