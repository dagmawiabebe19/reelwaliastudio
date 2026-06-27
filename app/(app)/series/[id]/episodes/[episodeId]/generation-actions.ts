"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { logGenerationError } from "@/lib/ai/generation/errors";
import { createPendingTakes, executeGenerationJob } from "@/lib/ai/generation/run";
import { getPublicModelCatalog } from "@/lib/ai/registry";
import { listTakesByScene, setTakeStarred } from "@/lib/db/takes";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { resolveAssetUrl } from "@/lib/storage/resolve-urls";

export async function getModelCatalogAction(kind?: "image" | "video") {
  return getPublicModelCatalog(kind);
}

export async function listTakesAction(sceneId: string) {
  try {
    const takes = await listTakesByScene(sceneId);
    const enriched = await Promise.all(
      takes.map(async (take) => ({
        id: take.id,
        take_number: take.take_number,
        media_type: take.media_type,
        model: take.model,
        resolution: take.resolution,
        duration_seconds: take.duration_seconds,
        starred: take.starred,
        status: take.status,
        error_message: take.error_message,
        assetUrl: await resolveAssetUrl(take.assets),
      })),
    );
    return { takes: enriched };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load takes." };
  }
}

export async function generateTakesAction(input: {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  modelId: string;
  count: number;
  resolution: string;
  durationSeconds?: number;
}) {
  try {
    const takeIds = await createPendingTakes(input);
    const path = `/series/${input.seriesId}/episodes/${input.episodeId}`;

    after(async () => {
      try {
        await executeGenerationJob(input, takeIds);
      } catch (error) {
        logGenerationError("background-job", error, {
          takeIds,
          sceneId: input.sceneId,
          modelId: input.modelId,
        });
      }
      revalidatePath(path);
    });

    revalidatePath(path);
    return { takeIds, status: "pending" as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Generation failed to start." };
  }
}

export async function starTakeAction(
  takeId: string,
  starred: boolean,
  seriesId: string,
  episodeId: string,
) {
  try {
    await setTakeStarred(takeId, starred);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update take." };
  }
}

export async function getTakeDownloadUrlAction(assetBucket: string, assetPath: string) {
  try {
    const url = await getSignedUrl(assetBucket, assetPath);
    return { url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to get download URL." };
  }
}
