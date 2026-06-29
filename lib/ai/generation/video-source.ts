import "server-only";

import { listTakesByScene } from "@/lib/db/takes";
import { collectBoundVideoReferenceAssets } from "@/lib/production/resolve-references";
import type { VideoReferenceImage } from "@/lib/ai/video/types";
import { getStorageClient } from "@/lib/storage/client";
import { getSignedUrl } from "@/lib/storage/signed-url";

export type VideoSourceTake = {
  id: string;
  take_number: number;
  starred: boolean;
  bucket: string;
  storagePath: string;
};

async function pickReadyImageTake(sceneId: string) {
  const takes = await listTakesByScene(sceneId);
  const readyImages = takes.filter(
    (take) => take.media_type === "image" && take.status === "ready" && take.assets,
  );

  if (!readyImages.length) return null;

  const starred = readyImages.find((take) => take.starred);
  return starred ?? readyImages[readyImages.length - 1];
}

export async function resolveVideoSourceTake(
  sceneId: string,
): Promise<{ take: VideoSourceTake } | null> {
  const pick = await pickReadyImageTake(sceneId);
  if (!pick?.assets) return null;

  return {
    take: {
      id: pick.id,
      take_number: pick.take_number,
      starred: pick.starred,
      bucket: pick.assets.bucket,
      storagePath: pick.assets.storage_path,
    },
  };
}

/** @deprecated Prefer resolveVideoSourceTake — signed URLs expire and must not be sent to Higgsfield. */
export async function resolveVideoStartImageUrl(
  sceneId: string,
): Promise<{ url: string; take: Omit<VideoSourceTake, "bucket" | "storagePath"> } | null> {
  const resolved = await resolveVideoSourceTake(sceneId);
  if (!resolved) return null;

  const url = await getSignedUrl(resolved.take.bucket, resolved.take.storagePath);
  if (!url) return null;

  const { bucket: _bucket, storagePath: _storagePath, ...take } = resolved.take;
  return { url, take };
}

export async function downloadVideoSourceImage(
  source: Pick<VideoSourceTake, "bucket" | "storagePath">,
): Promise<{ buffer: Buffer; contentType: string }> {
  const supabase = await getStorageClient();
  const { data, error } = await supabase.storage
    .from(source.bucket)
    .download(source.storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to download source image from storage: ${error?.message ?? "unknown error"}.`,
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const contentType = data.type || "image/png";
  return { buffer, contentType };
}

export async function validateVideoGeneration(
  sceneId: string,
): Promise<
  | { ok: true; sourceTake: VideoSourceTake; startImageUrl: string }
  | { ok: false; error: string }
> {
  const resolved = await resolveVideoSourceTake(sceneId);
  if (!resolved) {
    return {
      ok: false,
      error:
        "Video generation requires a ready image take for this scene. Generate a storyboard image first, then star it (or use the latest ready image take) as the source frame.",
    };
  }

  const startImageUrl = await getSignedUrl(resolved.take.bucket, resolved.take.storagePath);
  if (!startImageUrl) {
    return {
      ok: false,
      error: "Failed to sign source image URL for video generation.",
    };
  }

  return { ok: true, sourceTake: resolved.take, startImageUrl };
}

export async function validateSeedanceVideoGeneration(
  sceneId: string,
): Promise<
  | { ok: true; references: VideoReferenceImage[] }
  | { ok: false; error: string }
> {
  const references = await collectBoundVideoReferenceAssets(sceneId);
  if (!references.length) {
    return {
      ok: false,
      error:
        "Seedance requires bound reference images for this segment (character sheet and/or location). Mention characters and locations in the segment prompt to auto-bind references, or bind them manually.",
    };
  }

  return { ok: true, references };
}
