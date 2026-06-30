"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getActiveUserId } from "@/lib/auth/getUser";
import { formatActionError } from "@/lib/credits/action-result";
import { assertSufficientCredits } from "@/lib/credits/meter";
import { estimateVideoCredits } from "@/lib/credits/pricing";
import { isInsufficientCreditsError } from "@/lib/credits/errors";
import { logGenerationError } from "@/lib/ai/generation/errors";
import { createPendingTakes, executeGenerationJob } from "@/lib/ai/generation/run";
import { SEGMENT_VIDEO_MODEL_ID } from "@/lib/ai/registry";
import {
  normalizeSeedanceAudioMode,
  resolveQualitySettings,
  type GenerationQualityMode,
  type SeedanceAudioMode,
} from "@/lib/ai/video/seedance-constants";
import { clearFailedTakesWithCleanup } from "@/lib/db/delete";
import { getScene, updateScene } from "@/lib/db/scenes";
import { listTakesByScene, setTakeStarred } from "@/lib/db/takes";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { resolveAssetUrl } from "@/lib/storage/resolve-urls";
import { normalizeShotIntent } from "@/lib/production/prompts";

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
        has_audio: take.has_audio ?? false,
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
  quality: GenerationQualityMode;
  durationSeconds?: number;
  takeCount?: number;
  shotIntentOverride?: string | null;
  audioModeOverride?: SeedanceAudioMode;
}) {
  try {
    const userId = await getActiveUserId();
    const scene = await getScene(input.sceneId);
    if (!scene) {
      return { error: "Scene not found." };
    }

    const takeCount = Math.min(5, Math.max(1, Math.round(input.takeCount ?? 1)));
    const { tier, resolution } = resolveQualitySettings(input.quality);
    const durationSeconds = input.durationSeconds ?? scene.duration_seconds ?? 6;
    const shotIntent =
      input.shotIntentOverride !== undefined
        ? normalizeShotIntent(input.shotIntentOverride)
        : normalizeShotIntent(scene.shot_intent);
    const seedanceAudioMode =
      input.audioModeOverride ??
      normalizeSeedanceAudioMode(scene.audio_mode) ??
      ("ambient" as SeedanceAudioMode);

    const estimatePerTake = estimateVideoCredits({
      tier,
      resolution,
      durationSeconds,
    });
    const totalEstimate = estimatePerTake * takeCount;
    await assertSufficientCredits(userId, totalEstimate);

    const scenePatch: Parameters<typeof updateScene>[1] = {};
    if (input.durationSeconds != null) {
      scenePatch.duration_seconds = durationSeconds;
    }
    if (input.shotIntentOverride !== undefined && shotIntent) {
      scenePatch.shot_intent = shotIntent;
    }
    if (input.audioModeOverride) {
      scenePatch.audio_mode = seedanceAudioMode;
    }
    if (Object.keys(scenePatch).length > 0) {
      await updateScene(input.sceneId, scenePatch);
    }

    const params = {
      sceneId: input.sceneId,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      resolution,
      durationSeconds,
      seedanceTier: tier,
      seedanceAudioMode,
      shotIntent,
      modelId: SEGMENT_VIDEO_MODEL_ID,
      takeCount,
    };

    const takeIds = await createPendingTakes(params);
    const path = `/series/${input.seriesId}/episodes/${input.episodeId}`;

    after(async () => {
      try {
        await executeGenerationJob(params, takeIds);
      } catch (error) {
        if (isInsufficientCreditsError(error)) {
          const { markTakeFailed } = await import("@/lib/db/takes");
          await Promise.all(
            takeIds.map((id) =>
              markTakeFailed(
                id,
                `Not enough credits (need ${error.needed}, have ${error.available}).`,
              ),
            ),
          );
        } else {
          logGenerationError("background-job", error, {
            takeIds,
            sceneId: input.sceneId,
            modelId: SEGMENT_VIDEO_MODEL_ID,
          });
        }
      }
      revalidatePath(path);
    });

    revalidatePath(path);
    return { takeIds, status: "pending" as const, estimatedCredits: totalEstimate };
  } catch (error) {
    return formatActionError(error, "Generation failed to start.");
  }
}

export async function clearFailedTakesAction(
  sceneId: string,
  seriesId: string,
  episodeId: string,
) {
  try {
    const deleted = await clearFailedTakesWithCleanup(sceneId, episodeId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { deleted };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to clear failed takes." };
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
