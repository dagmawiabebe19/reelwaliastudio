import "server-only";

import { formatGenerationError, logGenerationError } from "@/lib/ai/generation/errors";
import { orientationToAspectRatio } from "@/lib/ai/orientation";
import { runVideoModel } from "@/lib/ai/router";
import { getModelById, isModelConfigured, SEGMENT_VIDEO_MODEL_ID } from "@/lib/ai/registry";
import { createAsset } from "@/lib/db/assets";
import { getScene, effectiveOrientation } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import {
  createTake,
  getTake,
  markTakeFailed,
  markTakeReady,
} from "@/lib/db/takes";
import { validateSeedanceVideoGeneration } from "@/lib/ai/generation/video-source";
import { composeVideoPrompt } from "@/lib/production/prompts";
import { seedanceGenerateAudio } from "@/lib/ai/video/seedance-constants";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { persistRemoteAsset } from "@/lib/storage/persist-generated";
import type { GenerationProgressCallback } from "@/lib/generation/progress";

export interface GenerateTakeParams {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  modelId: string;
  resolution: string;
  durationSeconds?: number;
  seedanceTier?: "standard" | "fast";
  seedanceAudioMode?: "off" | "full" | "ambient";
  shotIntent?: string | null;
}

export interface TakeGenerationOutcome {
  id: string;
  status: string;
  error_message: string | null;
}

export interface GenerationJobOutcome {
  ready: number;
  failed: number;
  pending: number;
  takes: TakeGenerationOutcome[];
}

async function resolveTakeOutcomes(takeIds: string[]): Promise<TakeGenerationOutcome[]> {
  return Promise.all(
    takeIds.map(async (id) => {
      const take = await getTake(id);
      return {
        id,
        status: take?.status ?? "failed",
        error_message:
          take?.error_message ??
          (take ? null : "Take record not found after generation."),
      };
    }),
  );
}

function countByStatus(takes: TakeGenerationOutcome[]): Pick<GenerationJobOutcome, "ready" | "failed" | "pending"> {
  return {
    ready: takes.filter((t) => t.status === "ready").length,
    failed: takes.filter((t) => t.status === "failed").length,
    pending: takes.filter((t) => t.status === "pending").length,
  };
}

async function buildOutcome(takeIds: string[]): Promise<GenerationJobOutcome> {
  const takes = await resolveTakeOutcomes(takeIds);
  return { ...countByStatus(takes), takes };
}

export async function createPendingTakes(params: GenerateTakeParams): Promise<string[]> {
  const modelId = params.modelId || SEGMENT_VIDEO_MODEL_ID;
  const model = getModelById(modelId);
  if (!model || model.kind !== "video") {
    throw new Error("Segment generation uses Seedance video only.");
  }
  if (!isModelConfigured(model)) {
    throw new Error(`${model.label} is not configured. Set ${model.envKey} to enable.`);
  }

  const seedanceCheck = await validateSeedanceVideoGeneration(params.sceneId);
  if (!seedanceCheck.ok) {
    throw new Error(seedanceCheck.error);
  }

  const take = await createTake({
    sceneId: params.sceneId,
    mediaType: "video",
    model: modelId,
    resolution: params.resolution,
    durationSeconds: params.durationSeconds ?? 6,
    status: "pending",
  });

  return [take.id];
}

export async function executeGenerationJob(
  params: GenerateTakeParams,
  takeIds: string[],
  onProgress?: GenerationProgressCallback,
): Promise<GenerationJobOutcome> {
  try {
    const scene = await getScene(params.sceneId);
    if (!scene) throw new Error("Scene not found.");

    const series = await getSeries(params.seriesId);
    if (!series) throw new Error("Series not found.");

    const model = getModelById(params.modelId || SEGMENT_VIDEO_MODEL_ID);
    if (!model) throw new Error("Unknown model.");

    onProgress?.("resolving references…", 0, takeIds.length);

    const aspectRatio = orientationToAspectRatio(
      effectiveOrientation(scene.orientation, series.default_orientation),
    );
    const scenePrompt = scene.prompt?.trim() || scene.title;
    const prompt = composeVideoPrompt({
      scenePrompt,
      shotIntent: scene.shot_intent,
    });

    await resolveSceneReferences({
      sceneId: params.sceneId,
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      autoBind: true,
    });

    const seedanceAudioMode = params.seedanceAudioMode ?? "off";
    const durationSeconds = params.durationSeconds ?? 6;
    const durationMs = durationSeconds * 1000;

    const seedanceCheck = await validateSeedanceVideoGeneration(params.sceneId);
    if (!seedanceCheck.ok) {
      await Promise.all(takeIds.map((id) => markTakeFailed(id, seedanceCheck.error)));
      return buildOutcome(takeIds);
    }

    onProgress?.("generating video…", 0, takeIds.length);

    let result;
    try {
      result = await runVideoModel(params.modelId || SEGMENT_VIDEO_MODEL_ID, {
        prompt,
        referenceImages: seedanceCheck.references,
        durationSeconds,
        aspectRatio,
        resolution: params.resolution,
        sceneId: params.sceneId,
        seedanceTier: params.seedanceTier,
        seedanceAudioMode,
      });
    } catch (error) {
      const message = formatGenerationError(error, `${model.label}: generation request failed.`);
      logGenerationError("provider", error, {
        modelId: params.modelId,
        sceneId: params.sceneId,
        takeIds,
      });
      await Promise.all(takeIds.map((id) => markTakeFailed(id, message)));
      return buildOutcome(takeIds);
    }

    if (result.error || (result.assetUrls.length === 0 && !result.persistedAssets?.length)) {
      const message = formatGenerationError(result.error, "Generation returned no assets.");
      logGenerationError("provider-result", message, {
        modelId: params.modelId,
        sceneId: params.sceneId,
        takeIds,
        configured: result.configured,
      });
      await Promise.all(takeIds.map((id) => markTakeFailed(id, message)));
      return buildOutcome(takeIds);
    }

    for (let i = 0; i < takeIds.length; i++) {
      const takeId = takeIds[i];
      onProgress?.("saving video…", i + 1, takeIds.length);
      const persisted = result.persistedAssets?.[i] ?? result.persistedAssets?.[0];
      const remoteUrl = result.assetUrls[i] ?? result.assetUrls[0];
      const takeDurationSeconds = result.videoDurationSeconds ?? durationSeconds;
      const takeDurationMs =
        takeDurationSeconds != null ? takeDurationSeconds * 1000 : durationMs;
      const takeHasAudio = seedanceGenerateAudio(seedanceAudioMode);

      try {
        if (persisted) {
          const asset = await createAsset({
            bucket: persisted.bucket,
            storagePath: persisted.storagePath,
            mediaType: persisted.mediaType,
            width: persisted.width ?? null,
            height: persisted.height ?? null,
            durationMs: takeDurationMs,
            source: "generated",
            model: params.modelId || SEGMENT_VIDEO_MODEL_ID,
            prompt,
          });

          await markTakeReady(takeId, asset.id, {
            duration_seconds: takeDurationSeconds,
            has_audio: takeHasAudio,
          });
          continue;
        }

        if (!remoteUrl) {
          const message = "No asset URL returned for this take.";
          logGenerationError("persist", message, { takeId, modelId: params.modelId, sceneId: params.sceneId });
          await markTakeFailed(takeId, message);
          continue;
        }

        const stored = await persistRemoteAsset({
          sceneId: params.sceneId,
          remoteUrl,
          model: params.modelId || SEGMENT_VIDEO_MODEL_ID,
          prompt,
        });

        const asset = await createAsset({
          bucket: stored.bucket,
          storagePath: stored.storagePath,
          mediaType: stored.mediaType,
          durationMs: takeDurationMs,
          source: "generated",
          model: params.modelId || SEGMENT_VIDEO_MODEL_ID,
          prompt,
        });

        await markTakeReady(takeId, asset.id, {
          duration_seconds: takeDurationSeconds,
          has_audio: takeHasAudio,
        });
      } catch (error) {
        const message = formatGenerationError(error, "Failed to persist generated asset.");
        logGenerationError("persist", error, {
          takeId,
          modelId: params.modelId,
          sceneId: params.sceneId,
        });
        await markTakeFailed(takeId, message);
      }
    }

    return buildOutcome(takeIds);
  } catch (error) {
    const message = formatGenerationError(error, "Generation job failed.");
    logGenerationError("job", error, {
      takeIds,
      modelId: params.modelId,
      sceneId: params.sceneId,
    });
    await Promise.all(
      takeIds.map(async (id) => {
        const take = await getTake(id);
        if (take?.status === "pending") {
          await markTakeFailed(id, message);
        }
      }),
    );
    return buildOutcome(takeIds);
  }
}
