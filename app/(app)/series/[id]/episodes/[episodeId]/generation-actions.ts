"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { logGenerationError } from "@/lib/ai/generation/errors";
import {
  runWithConcurrency,
  sceneNeedsImageStill,
} from "@/lib/ai/generation/batch-stills";
import { createPendingTakes, executeGenerationJob, type GenerateTakeParams } from "@/lib/ai/generation/run";
import { getModelById, getPublicModelCatalog, isModelConfigured } from "@/lib/ai/registry";
import { listHiggsfieldMotions } from "@/lib/ai/video/higgsfield";
import { clearFailedTakesWithCleanup } from "@/lib/db/delete";
import { listScenesByEpisode, updateScene } from "@/lib/db/scenes";
import { listTakesByScene, listTakesForScenes, setTakeStarred } from "@/lib/db/takes";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { resolveAssetUrl } from "@/lib/storage/resolve-urls";

export async function getModelCatalogAction(kind?: "image" | "video") {
  return getPublicModelCatalog(kind);
}

export async function listHiggsfieldMotionsAction() {
  try {
    const motions = await listHiggsfieldMotions();
    return { motions };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load Higgsfield motions." };
  }
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
  dopModel?: string;
  motionId?: string | null;
  motionStrength?: number;
  seedanceTier?: "standard" | "fast";
  shotIntent?: string | null;
}) {
  try {
    if (input.shotIntent != null) {
      await updateScene(input.sceneId, { shot_intent: input.shotIntent });
    }

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

export async function generateEpisodeStillsAction(input: {
  episodeId: string;
  seriesId: string;
  modelId: string;
  resolution: string;
  actLabel: string;
}) {
  try {
    const model = getModelById(input.modelId);
    if (!model) return { error: "Unknown model." };
    if (model.kind !== "image") {
      return { error: "Batch generation supports image stills only." };
    }
    if (!isModelConfigured(model)) {
      return { error: `${model.label} is not configured. Set ${model.envKey} to enable.` };
    }

    const scenes = await listScenesByEpisode(input.episodeId);
    const actScenes = scenes.filter(
      (scene) =>
        scene.status !== "archived" &&
        (scene.act_label ?? "Storyboard-only") === input.actLabel,
    );

    if (!actScenes.length) {
      return { queued: 0 };
    }

    const takes = await listTakesForScenes(actScenes.map((scene) => scene.id));
    const takesByScene = new Map<string, typeof takes>();
    for (const take of takes) {
      const bucket = takesByScene.get(take.scene_id) ?? [];
      bucket.push(take);
      takesByScene.set(take.scene_id, bucket);
    }

    const jobs: Array<{ params: GenerateTakeParams; takeIds: string[] }> = [];

    for (const scene of actScenes) {
      const sceneTakes = takesByScene.get(scene.id) ?? [];
      if (!sceneNeedsImageStill(sceneTakes)) continue;

      const params: GenerateTakeParams = {
        sceneId: scene.id,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        modelId: input.modelId,
        count: 1,
        resolution: input.resolution,
      };
      const takeIds = await createPendingTakes(params);
      jobs.push({ params, takeIds });
    }

    if (!jobs.length) {
      return { queued: 0 };
    }

    const path = `/series/${input.seriesId}/episodes/${input.episodeId}`;

    after(async () => {
      await runWithConcurrency(jobs, 3, async (job) => {
        try {
          await executeGenerationJob(job.params, job.takeIds);
        } catch (error) {
          logGenerationError("background-batch-still", error, {
            takeIds: job.takeIds,
            sceneId: job.params.sceneId,
            modelId: job.params.modelId,
          });
        }
        revalidatePath(path);
      });
      revalidatePath(path);
    });

    revalidatePath(path);
    return { queued: jobs.length };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Batch still generation failed to start." };
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
