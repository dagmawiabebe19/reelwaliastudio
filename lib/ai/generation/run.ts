import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { isInsufficientCreditsError } from "@/lib/credits/errors";
import { estimateVideoCredits } from "@/lib/credits/pricing";
import { withCredits } from "@/lib/credits/meter";
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
  setTakeProviderJob,
} from "@/lib/db/takes";
import { validateSeedanceVideoGeneration } from "@/lib/ai/generation/video-source";
import { composeVideoPrompt, normalizeShotIntent } from "@/lib/production/prompts";
import {
  normalizeSeedanceAudioMode,
  seedanceGenerateAudio,
  type SeedanceAudioMode,
} from "@/lib/ai/video/seedance-constants";
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
  seedanceAudioMode?: SeedanceAudioMode;
  shotIntent?: string | null;
  takeCount?: number;
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

  const seedanceCheck = await validateSeedanceVideoGeneration(params.sceneId, {
    seriesId: params.seriesId,
    episodeId: params.episodeId,
  });
  if (!seedanceCheck.ok) {
    throw new Error(seedanceCheck.error);
  }

  const takeCount = Math.min(5, Math.max(1, Math.round(params.takeCount ?? 1)));
  const takeIds: string[] = [];

  for (let i = 0; i < takeCount; i++) {
    const take = await createTake({
      sceneId: params.sceneId,
      mediaType: "video",
      model: modelId,
      resolution: params.resolution,
      durationSeconds: params.durationSeconds ?? 6,
      status: "pending",
    });
    takeIds.push(take.id);
  }

  return takeIds;
}

async function runVideoGenerationCore(
  params: GenerateTakeParams,
  takeId: string,
  onProgress?: GenerationProgressCallback,
  takeIndex = 0,
  takeTotal = 1,
): Promise<{ videoDurationSeconds: number }> {
  const scene = await getScene(params.sceneId);
  if (!scene) throw new Error("Scene not found.");

  const series = await getSeries(params.seriesId);
  if (!series) throw new Error("Series not found.");

  const model = getModelById(params.modelId || SEGMENT_VIDEO_MODEL_ID);
  if (!model) throw new Error("Unknown model.");

  onProgress?.("resolving references…", takeIndex, takeTotal);

  const aspectRatio = orientationToAspectRatio(
    effectiveOrientation(scene.orientation, series.default_orientation),
  );
  const scenePrompt = scene.prompt?.trim() || scene.title;
  const shotIntent =
    normalizeShotIntent(params.shotIntent) ?? normalizeShotIntent(scene.shot_intent);
  const seedanceAudioMode =
    params.seedanceAudioMode ??
    normalizeSeedanceAudioMode(scene.audio_mode) ??
    "ambient";
  const prompt = composeVideoPrompt({
    scenePrompt,
    shotIntent,
    audioMode: seedanceAudioMode,
  });

  await resolveSceneReferences({
    sceneId: params.sceneId,
    seriesId: params.seriesId,
    episodeId: params.episodeId,
    autoBind: true,
  });

  const durationSeconds = params.durationSeconds ?? scene.duration_seconds ?? 6;

  const seedanceCheck = await validateSeedanceVideoGeneration(params.sceneId, {
    seriesId: params.seriesId,
    episodeId: params.episodeId,
  });
  if (!seedanceCheck.ok) {
    throw new Error(seedanceCheck.error);
  }

  onProgress?.(
    takeTotal > 1 ? `generating take ${takeIndex + 1}/${takeTotal}…` : "generating video…",
    takeIndex,
    takeTotal,
  );

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
      providerHint: takeId,
      onFalEnqueued: async (requestId, endpoint) => {
        await setTakeProviderJob(takeId, {
          providerRequestId: requestId,
          providerEndpoint: endpoint,
        });
      },
    });
  } catch (error) {
    const message = formatGenerationError(error, `${model.label}: generation request failed.`);
    logGenerationError("provider", error, {
      modelId: params.modelId,
      sceneId: params.sceneId,
      takeIds: [takeId],
    });
    throw new Error(message);
  }

  if (result.error || (result.assetUrls.length === 0 && !result.persistedAssets?.length)) {
    const message = formatGenerationError(result.error, "Generation returned no assets.");
    logGenerationError("provider-result", message, {
      modelId: params.modelId,
      sceneId: params.sceneId,
      takeIds: [takeId],
      configured: result.configured,
    });
    throw new Error(message);
  }

  const takeDurationSeconds = result.videoDurationSeconds ?? durationSeconds;

  onProgress?.("saving video…", takeIndex + 1, takeTotal);
  const persisted = result.persistedAssets?.[0];
  const remoteUrl = result.assetUrls[0];
  const takeDurationMs = takeDurationSeconds * 1000;
  const takeHasAudio = seedanceGenerateAudio(seedanceAudioMode);

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
    return { videoDurationSeconds: takeDurationSeconds };
  }

  if (!remoteUrl) {
    throw new Error("No asset URL returned for this take.");
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

  return { videoDurationSeconds: takeDurationSeconds };
}

export async function executeGenerationJob(
  params: GenerateTakeParams,
  takeIds: string[],
  onProgress?: GenerationProgressCallback,
  options?: { userId?: string },
): Promise<GenerationJobOutcome> {
  const userId = options?.userId ?? (await getActiveUserId());
  const seedanceTier = params.seedanceTier ?? "fast";
  const durationSeconds = params.durationSeconds ?? 6;

  for (let i = 0; i < takeIds.length; i++) {
    const takeId = takeIds[i];
    const estimate = estimateVideoCredits({
      tier: seedanceTier,
      resolution: params.resolution,
      durationSeconds,
    });
    const reference = `seedance:take:${takeId}`;

    try {
      await withCredits(userId, estimate, reference, async () => {
        const { videoDurationSeconds } = await runVideoGenerationCore(
          params,
          takeId,
          onProgress,
          i,
          takeIds.length,
        );
        const actualCredits = estimateVideoCredits({
          tier: seedanceTier,
          resolution: params.resolution,
          durationSeconds: videoDurationSeconds,
        });
        return { result: undefined, actualCredits };
      });
    } catch (error) {
      if (isInsufficientCreditsError(error)) {
        throw error;
      }

      const message = formatGenerationError(error, "Generation job failed.");
      logGenerationError("job", error, {
        takeIds: [takeId],
        modelId: params.modelId,
        sceneId: params.sceneId,
      });
      const take = await getTake(takeId);
      if (take?.status === "pending") {
        await markTakeFailed(takeId, message);
      }
    }
  }

  return buildOutcome(takeIds);
}
