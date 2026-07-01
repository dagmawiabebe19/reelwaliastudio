import "server-only";

import { collectBoundVideoReferenceAssets } from "@/lib/production/resolve-references";
import { validateSceneReferencesForVideoGeneration } from "@/lib/production/reference-readiness";
import type { VideoReferenceImage } from "@/lib/ai/video/types";
import { getStorageClient } from "@/lib/storage/client";

export async function downloadVideoSourceImage(
  source: { bucket: string; storagePath: string },
): Promise<{ buffer: Buffer; contentType: string }> {
  const supabase = await getStorageClient();
  const { data, error } = await supabase.storage
    .from(source.bucket)
    .download(source.storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to download reference image from storage: ${error?.message ?? "unknown error"}.`,
    );
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const contentType = data.type || "image/png";
  return { buffer, contentType };
}

export async function validateSeedanceVideoGeneration(
  sceneId: string,
  options?: { seriesId?: string; episodeId?: string },
): Promise<
  | { ok: true; references: VideoReferenceImage[] }
  | { ok: false; error: string }
> {
  const readiness = await validateSceneReferencesForVideoGeneration(sceneId, {
    ...options,
    repair: true,
  });
  if (!readiness.ok) {
    return readiness;
  }

  const references = await collectBoundVideoReferenceAssets(sceneId);
  if (!references.length) {
    return {
      ok: false,
      error:
        "Bind a character sheet or location to generate — mention them in the segment prompt to auto-bind references.",
    };
  }

  const usable = references.filter((ref) => ref.signedUrl || ref.bucket);
  if (!usable.length) {
    return {
      ok: false,
      error:
        "Bound references are missing usable images (failed, generating, or not uploaded). Regenerate or re-bind ready assets before video.",
    };
  }

  return { ok: true, references: usable };
}
