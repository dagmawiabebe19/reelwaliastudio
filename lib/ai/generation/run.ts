import "server-only";

import { formatGenerationError, logGenerationError } from "@/lib/ai/generation/errors";
import { orientationToAspectRatio } from "@/lib/ai/orientation";
import { runImageModel, runVideoModel } from "@/lib/ai/router";
import { getModelById, isModelConfigured } from "@/lib/ai/registry";
import { createAsset } from "@/lib/db/assets";
import { getScene, effectiveOrientation } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import {
  createTake,
  getTake,
  markTakeFailed,
  markTakeReady,
} from "@/lib/db/takes";
import { validateVideoGeneration } from "@/lib/ai/generation/video-source";
import { collectGenerationRefUrls, resolveSceneReferences } from "@/lib/production/resolve-references";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { persistRemoteAsset } from "@/lib/storage/persist-generated";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import type { GenerationProgressCallback } from "@/lib/generation/progress";

export interface GenerateTakeParams {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  modelId: string;
  count: number;
  resolution: string;
  durationSeconds?: number;
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

async function resolveIdentityLockUrlsFromScene(scene: SceneWithBindings): Promise<string[]> {
  const fromSheets = await collectGenerationRefUrls(scene.id);
  if (fromSheets.length) return fromSheets;

  const supabase = await import("@/lib/db/client").then((m) => m.getDbClient());
  const ingredientIds = (scene.scene_ingredients ?? [])
    .filter((b) => b.role === "identity_lock")
    .map((b) => b.ingredient_id);

  if (!ingredientIds.length) return [];

  const { data, error } = await supabase
    .from("ingredients")
    .select("primary_asset_id, assets:primary_asset_id(bucket, storage_path)")
    .in("id", ingredientIds);

  if (error) throw new Error(error.message);

  const urls: string[] = [];
  for (const row of data ?? []) {
    const raw = row.assets as { bucket: string; storage_path: string } | { bucket: string; storage_path: string }[] | null;
    const asset = Array.isArray(raw) ? raw[0] : raw;
    if (!asset) continue;
    const signed = await getSignedUrl(asset.bucket, asset.storage_path);
    if (signed) urls.push(signed);
  }
  return urls;
}

export async function createPendingTakes(params: GenerateTakeParams): Promise<string[]> {
  const model = getModelById(params.modelId);
  if (!model) throw new Error("Unknown model.");
  if (!isModelConfigured(model)) {
    throw new Error(`${model.label} is not configured. Set ${model.envKey} to enable.`);
  }
  if (params.count < 1 || params.count > 5) throw new Error("Take count must be between 1 and 5.");

  const isVideo = model.kind === "video";
  if (isVideo) {
    if (params.count > 1) {
      throw new Error("Video generation supports one take at a time.");
    }
    const videoCheck = await validateVideoGeneration(params.sceneId);
    if (!videoCheck.ok) {
      throw new Error(videoCheck.error);
    }
  }

  const takeIds: string[] = [];

  for (let i = 0; i < params.count; i++) {
    const take = await createTake({
      sceneId: params.sceneId,
      mediaType: isVideo ? "video" : "image",
      model: params.modelId,
      resolution: params.resolution,
      durationSeconds: isVideo ? (params.durationSeconds ?? 6) : null,
      status: "pending",
    });
    takeIds.push(take.id);
  }

  return takeIds;
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

    const model = getModelById(params.modelId);
    if (!model) throw new Error("Unknown model.");

    onProgress?.("resolving references…", 0, takeIds.length);

    const aspectRatio = orientationToAspectRatio(
      effectiveOrientation(scene.orientation, series.default_orientation),
    );
    const prompt = scene.prompt?.trim() || scene.title;

    await resolveSceneReferences({
      sceneId: params.sceneId,
      seriesId: params.seriesId,
      episodeId: params.episodeId,
      autoBind: true,
    });

    const refImageUrls = await resolveIdentityLockUrlsFromScene(scene);
    const isVideo = model.kind === "video";
    const total = takeIds.length;
    const durationSeconds = isVideo ? (params.durationSeconds ?? 6) : null;
    const durationMs = durationSeconds != null ? durationSeconds * 1000 : null;

    let startImageUrl: string | null = null;
    if (isVideo) {
      const videoCheck = await validateVideoGeneration(params.sceneId);
      if (!videoCheck.ok) {
        await Promise.all(takeIds.map((id) => markTakeFailed(id, videoCheck.error)));
        return buildOutcome(takeIds);
      }
      startImageUrl = videoCheck.startImageUrl;
    }

    onProgress?.(
      isVideo ? "generating video…" : `generating image${total > 1 ? "s" : ""}…`,
      0,
      total,
    );

    let result;
    try {
      result = isVideo
        ? await runVideoModel(params.modelId, {
            prompt,
            startImageUrl,
            durationSeconds: params.durationSeconds ?? 6,
            aspectRatio,
            resolution: params.resolution,
            sceneId: params.sceneId,
          })
        : await runImageModel(params.modelId, {
            prompt,
            refImageUrls,
            aspectRatio,
            count: params.count,
            resolution: params.resolution,
            safety: model.safety,
            sceneId: params.sceneId,
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
      onProgress?.(
        isVideo ? "saving video…" : `saving take ${i + 1}/${total}…`,
        i + 1,
        total,
      );
      const persisted = result.persistedAssets?.[i] ?? result.persistedAssets?.[0];
      const remoteUrl = result.assetUrls[i] ?? result.assetUrls[0];

      try {
        if (persisted) {
          const asset = await createAsset({
            bucket: persisted.bucket,
            storagePath: persisted.storagePath,
            mediaType: persisted.mediaType,
            width: persisted.width ?? null,
            height: persisted.height ?? null,
            durationMs: isVideo ? durationMs : null,
            source: "generated",
            model: params.modelId,
            prompt,
          });

          await markTakeReady(takeId, asset.id, { duration_seconds: durationSeconds });
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
          model: params.modelId,
          prompt,
        });

      const asset = await createAsset({
        bucket: stored.bucket,
        storagePath: stored.storagePath,
        mediaType: stored.mediaType,
        durationMs: isVideo ? durationMs : null,
        source: "generated",
        model: params.modelId,
        prompt,
      });

        await markTakeReady(takeId, asset.id, { duration_seconds: durationSeconds });
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
