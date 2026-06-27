import "server-only";

import { after } from "next/server";
import { runOpenAiImage } from "@/lib/ai/image/openai-image";
import { defaultAspectRatioForIngredients } from "@/lib/production/prompts";
import { createAsset } from "@/lib/db/assets";
import { getIngredient, updateIngredient } from "@/lib/db/ingredients";
import type { GenerationProgressCallback } from "@/lib/generation/progress";

export async function executeIngredientImageGeneration(input: {
  ingredientId: string;
  prompt: string;
  refImageUrls?: string[];
  onProgress?: GenerationProgressCallback;
}): Promise<{ status: "ready" | "failed"; error?: string }> {
  try {
    input.onProgress?.("Rendering image…", 1, 1);

    const result = await runOpenAiImage({
      prompt: input.prompt,
      refImageUrls: input.refImageUrls ?? [],
      aspectRatio: defaultAspectRatioForIngredients(),
      count: 1,
      resolution: "720p",
      safety: "sfw",
      sceneId: input.ingredientId,
    });

    if (result.error || !result.persistedAssets?.[0]) {
      const error = result.error ?? "No image returned.";
      await updateIngredient(input.ingredientId, {
        generation_status: "failed",
        generation_error: error,
      });
      return { status: "failed", error };
    }

    const persisted = result.persistedAssets[0];
    input.onProgress?.("Saving to library…", 1, 1);
    const asset = await createAsset({
      bucket: persisted.bucket,
      storagePath: persisted.storagePath,
      mediaType: persisted.mediaType,
      width: persisted.width ?? null,
      height: persisted.height ?? null,
      source: "generated",
      model: "openai-image",
      prompt: input.prompt,
    });

    await updateIngredient(input.ingredientId, {
      primary_asset_id: asset.id,
      generation_status: "ready",
      generation_error: null,
    });
    return { status: "ready" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    await updateIngredient(input.ingredientId, {
      generation_status: "failed",
      generation_error: message,
    });
    return { status: "failed", error: message };
  }
}

export async function queueIngredientImageGeneration(input: {
  ingredientId: string;
  prompt: string;
  refImageUrls?: string[];
  revalidatePath?: string;
}): Promise<void> {
  await updateIngredient(input.ingredientId, {
    generation_status: "pending",
    generation_error: null,
  });

  after(async () => {
    await executeIngredientImageGeneration({
      ingredientId: input.ingredientId,
      prompt: input.prompt,
      refImageUrls: input.refImageUrls,
    });
    if (input.revalidatePath) {
      const { revalidatePath } = await import("next/cache");
      revalidatePath(input.revalidatePath);
    }
  });
}

export async function getIngredientRefUrl(ingredientId: string): Promise<string | null> {
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient?.primary_asset_id) return null;
  const { getAsset } = await import("@/lib/db/assets");
  const { getSignedUrl } = await import("@/lib/storage/signed-url");
  const asset = await getAsset(ingredient.primary_asset_id);
  if (!asset) return null;
  return getSignedUrl(asset.bucket, asset.storage_path);
}
