import "server-only";

import { listTakesByScene } from "@/lib/db/takes";
import { getSignedUrl } from "@/lib/storage/signed-url";

export type VideoSourceTake = {
  id: string;
  take_number: number;
  starred: boolean;
};

export async function resolveVideoStartImageUrl(
  sceneId: string,
): Promise<{ url: string; take: VideoSourceTake } | null> {
  const takes = await listTakesByScene(sceneId);
  const readyImages = takes.filter(
    (take) => take.media_type === "image" && take.status === "ready" && take.assets,
  );

  if (!readyImages.length) return null;

  const starred = readyImages.find((take) => take.starred);
  const pick = starred ?? readyImages[readyImages.length - 1];
  if (!pick.assets) return null;

  const url = await getSignedUrl(pick.assets.bucket, pick.assets.storage_path);
  if (!url) return null;

  return {
    url,
    take: { id: pick.id, take_number: pick.take_number, starred: pick.starred },
  };
}

export async function validateVideoGeneration(
  sceneId: string,
): Promise<
  | { ok: true; startImageUrl: string; sourceTake: VideoSourceTake }
  | { ok: false; error: string }
> {
  const resolved = await resolveVideoStartImageUrl(sceneId);
  if (!resolved) {
    return {
      ok: false,
      error:
        "Video generation requires a ready image take for this scene. Generate a storyboard image first, then star it (or use the latest ready image take) as the source frame.",
    };
  }
  return { ok: true, startImageUrl: resolved.url, sourceTake: resolved.take };
}
