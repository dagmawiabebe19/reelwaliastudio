import "server-only";

import { orientationToAspectRatio } from "@/lib/ai/orientation";
import { runImageModel, runVideoModel } from "@/lib/ai/router";
import { getModelById, isModelConfigured } from "@/lib/ai/registry";
import { createAsset } from "@/lib/db/assets";
import { getScene, effectiveOrientation } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import {
  createTake,
  markTakeFailed,
  markTakeReady,
  updateTake,
} from "@/lib/db/takes";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { persistRemoteAsset } from "@/lib/storage/persist-generated";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

export interface GenerateTakeParams {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  modelId: string;
  count: number;
  resolution: string;
  durationSeconds?: number;
}

async function resolveIdentityLockUrlsFromScene(scene: SceneWithBindings): Promise<string[]> {
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
): Promise<void> {
  const scene = await getScene(params.sceneId);
  if (!scene) throw new Error("Scene not found.");

  const series = await getSeries(params.seriesId);
  if (!series) throw new Error("Series not found.");

  const model = getModelById(params.modelId);
  if (!model) throw new Error("Unknown model.");

  const aspectRatio = orientationToAspectRatio(
    effectiveOrientation(scene.orientation, series.default_orientation),
  );
  const prompt = scene.prompt?.trim() || scene.title;
  const refImageUrls = await resolveIdentityLockUrlsFromScene(scene);
  const isVideo = model.kind === "video";

  const result = isVideo
    ? await runVideoModel(params.modelId, {
        prompt,
        startImageUrl: refImageUrls[0] ?? null,
        durationSeconds: params.durationSeconds ?? 6,
        aspectRatio,
        resolution: params.resolution,
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

  if (result.error || (result.assetUrls.length === 0 && !result.persistedAssets?.length)) {
    const message = result.error ?? "Generation returned no assets.";
    await Promise.all(takeIds.map((id) => markTakeFailed(id, message)));
    return;
  }

  for (let i = 0; i < takeIds.length; i++) {
    const takeId = takeIds[i];
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
          source: "generated",
          model: params.modelId,
          prompt,
        });

        await markTakeReady(takeId, asset.id);
        await updateTake(takeId, {
          duration_seconds: isVideo ? (params.durationSeconds ?? 6) : null,
        });
        continue;
      }

      if (!remoteUrl) {
        await markTakeFailed(takeId, "No asset URL returned for this take.");
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
        source: "generated",
        model: params.modelId,
        prompt,
      });

      await markTakeReady(takeId, asset.id);
      await updateTake(takeId, {
        duration_seconds: isVideo ? (params.durationSeconds ?? 6) : null,
      });
    } catch (error) {
      await markTakeFailed(
        takeId,
        error instanceof Error ? error.message : "Failed to persist generated asset.",
      );
    }
  }
}
