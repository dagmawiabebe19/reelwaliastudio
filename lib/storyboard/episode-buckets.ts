import type { Episode } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

export const STORYBOARD_ONLY_LABEL = "Storyboard-only" as const;
export const ARCHIVE_BUCKET_ID = "__archive__" as const;
export const STORYBOARD_ONLY_BUCKET_ID = "__storyboard_only__" as const;

export type SegmentBucket =
  | { id: string; type: "episode"; episodeId: string; label: string }
  | { id: typeof STORYBOARD_ONLY_BUCKET_ID; type: "storyboard-only"; label: typeof STORYBOARD_ONLY_LABEL }
  | { id: typeof ARCHIVE_BUCKET_ID; type: "archive"; label: "Archive" };

export const HIGHLIGHT_SEGMENTS_STORAGE_KEY = "reelwalia-highlight-segments";

export type HighlightSegmentsPayload = {
  sceneIds: string[];
  episodeId?: string;
};

/** EP_01, EP_02, … from episode sort_order (0-based in DB). */
export function episodeBucketLabel(sortOrder: number): string {
  return `EP_${String(sortOrder + 1).padStart(2, "0")}`;
}

export function buildEpisodeBuckets(episodes: Episode[]): SegmentBucket[] {
  return episodes.map((episode) => ({
    id: episode.id,
    type: "episode" as const,
    episodeId: episode.id,
    label: episodeBucketLabel(episode.sort_order),
  }));
}

export function isStoryboardOnlyScene(scene: Pick<SceneWithBindings, "act_label">): boolean {
  return (scene.act_label ?? STORYBOARD_ONLY_LABEL) === STORYBOARD_ONLY_LABEL;
}

export function scenesForBucket(
  scenes: SceneWithBindings[],
  bucket: SegmentBucket,
): SceneWithBindings[] {
  if (bucket.type === "archive") {
    return scenes
      .filter((scene) => scene.status === "archived")
      .sort((a, b) => a.sort_order - b.sort_order || (a.position ?? 0) - (b.position ?? 0));
  }

  if (bucket.type === "storyboard-only") {
    return scenes
      .filter(
        (scene) => scene.status !== "archived" && isStoryboardOnlyScene(scene),
      )
      .sort((a, b) => a.sort_order - b.sort_order || (a.position ?? 0) - (b.position ?? 0));
  }

  return scenes
    .filter(
      (scene) =>
        scene.status !== "archived" &&
        scene.episode_id === bucket.episodeId &&
        !isStoryboardOnlyScene(scene),
    )
    .sort((a, b) => a.sort_order - b.sort_order || (a.position ?? 0) - (b.position ?? 0));
}

/** Reorder scenes within a bucket while preserving order of scenes outside the bucket. */
export function computeEpisodeOrderAfterBucketReorder(
  scenes: SceneWithBindings[],
  bucket: SegmentBucket,
  orderedBucketSceneIds: string[],
  fallbackEpisodeId?: string,
): string[] {
  const bucketSceneList = scenesForBucket(scenes, bucket);
  const bucketIdSet = new Set(bucketSceneList.map((scene) => scene.id));
  const episodeId =
    bucket.type === "episode"
      ? bucket.episodeId
      : bucketSceneList[0]?.episode_id ?? fallbackEpisodeId;

  if (!episodeId) return orderedBucketSceneIds;

  const episodeOrder = scenes
    .filter((scene) => scene.episode_id === episodeId)
    .sort((a, b) => a.sort_order - b.sort_order || (a.position ?? 0) - (b.position ?? 0))
    .map((scene) => scene.id);

  let bucketIdx = 0;
  return episodeOrder.map((id) => {
    if (bucketIdSet.has(id)) {
      return orderedBucketSceneIds[bucketIdx++] ?? id;
    }
    return id;
  });
}

export function resolveActLabelForEpisode(
  episode: Pick<Episode, "sort_order">,
  rawActLabel?: unknown,
): string {
  if (typeof rawActLabel === "string" && rawActLabel.trim() === STORYBOARD_ONLY_LABEL) {
    return STORYBOARD_ONLY_LABEL;
  }
  return episodeBucketLabel(episode.sort_order);
}

export function readHighlightSegments(): HighlightSegmentsPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HIGHLIGHT_SEGMENTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HighlightSegmentsPayload;
    if (!parsed?.sceneIds?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHighlightSegments(payload: HighlightSegmentsPayload): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(HIGHLIGHT_SEGMENTS_STORAGE_KEY, JSON.stringify(payload));
}

export function clearHighlightSegments(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(HIGHLIGHT_SEGMENTS_STORAGE_KEY);
}
