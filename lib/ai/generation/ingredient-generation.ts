import "server-only";

import { after } from "next/server";
import { getActiveUserId } from "@/lib/auth/getUser";
import { CopilotAbortError } from "@/lib/ai/copilot/abort";
import { isInsufficientCreditsError } from "@/lib/credits/errors";
import { estimateImageCredits } from "@/lib/credits/pricing";
import { withCredits, withCreditsAbortable } from "@/lib/credits/meter";
import { runOpenAiImage } from "@/lib/ai/image/openai-image";
import { defaultAspectRatioForIngredients } from "@/lib/production/prompts";
import { createAsset } from "@/lib/db/assets";
import { getIngredient, updateIngredient } from "@/lib/db/ingredients";
import type { GenerationProgressCallback } from "@/lib/generation/progress";

async function runIngredientImageCore(input: {
  ingredientId: string;
  prompt: string;
  refImageUrls?: string[];
  onProgress?: GenerationProgressCallback;
  abortSignal?: AbortSignal;
  onBillableWorkStarted?: () => void;
  ownerId?: string;
}): Promise<{ status: "ready" }> {
  input.onProgress?.("Rendering image…", 1, 1);

  const result = await runOpenAiImage({
    prompt: input.prompt,
    refImageUrls: input.refImageUrls ?? [],
    aspectRatio: defaultAspectRatioForIngredients(),
    count: 1,
    resolution: "720p",
    safety: "sfw",
    sceneId: input.ingredientId,
    abortSignal: input.abortSignal,
    onBillableWorkStarted: input.onBillableWorkStarted,
    ownerId: input.ownerId,
  });

  if (result.error || !result.persistedAssets?.[0]) {
    throw new Error(result.error ?? "No image returned.");
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
  }, { ownerId: input.ownerId });

  await updateIngredient(input.ingredientId, {
    primary_asset_id: asset.id,
    generation_status: "ready",
    generation_error: null,
  });

  return { status: "ready" };
}

export async function executeIngredientImageGeneration(input: {
  ingredientId: string;
  prompt: string;
  refImageUrls?: string[];
  onProgress?: GenerationProgressCallback;
  abortSignal?: AbortSignal;
  onBillableWorkStarted?: () => void;
  userId?: string;
}): Promise<{ status: "ready" | "failed"; error?: string }> {
  const userId = input.userId ?? (await getActiveUserId());
  const ownerId = input.userId;
  const estimate = estimateImageCredits(1);
  const reference = `openai-image:ingredient:${input.ingredientId}`;

  try {
    if (input.abortSignal) {
      return await withCreditsAbortable(
        userId,
        estimate,
        reference,
        async (ctx) => {
          const result = await runIngredientImageCore({
            ...input,
            ownerId,
            onBillableWorkStarted: () => {
              ctx.markBillableWorkStarted();
              input.onBillableWorkStarted?.();
            },
          });
          return { result, actualCredits: estimate };
        },
        { abortSignal: input.abortSignal },
      );
    }

    return await withCredits(userId, estimate, reference, async () => {
      const result = await runIngredientImageCore({ ...input, ownerId });
      return { result, actualCredits: estimate };
    });
  } catch (error) {
    if (error instanceof CopilotAbortError) {
      throw error;
    }
    if (isInsufficientCreditsError(error)) {
      throw error;
    }

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
    try {
      await executeIngredientImageGeneration({
        ingredientId: input.ingredientId,
        prompt: input.prompt,
        refImageUrls: input.refImageUrls,
      });
    } catch (error) {
      if (isInsufficientCreditsError(error)) {
        await updateIngredient(input.ingredientId, {
          generation_status: "failed",
          generation_error: `Not enough credits (need ${error.needed}, have ${error.available}).`,
        });
      }
    }
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

export async function buildIngredientImageRetryInput(
  ingredientId: string,
): Promise<{ prompt: string; refImageUrls?: string[] } | { error: string }> {
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient) return { error: "Ingredient not found." };
  if (ingredient.generation_status === "pending") {
    return { error: "Ingredient is already generating." };
  }

  const description = ingredient.description?.trim();
  if (!description) {
    return { error: "Missing description — cannot retry without the original prompt." };
  }

  const {
    CHARACTER_HEADSHOT_PREFIX,
    LOCATION_ESTABLISHING_PREFIX,
    costumePreviewPrompt,
  } = await import("@/lib/production/prompts");

  switch (ingredient.kind) {
    case "character":
      return { prompt: `${CHARACTER_HEADSHOT_PREFIX}${description}` };
    case "location":
      return { prompt: `${LOCATION_ESTABLISHING_PREFIX}${description}` };
    case "outfit": {
      if (!ingredient.character_id) {
        return { error: "Costume is missing its character link." };
      }
      const character = await getIngredient(ingredient.character_id);
      if (!character || character.kind !== "character") {
        return { error: "Linked character not found." };
      }
      const headshotUrl = await getIngredientRefUrl(ingredient.character_id);
      if (!headshotUrl) {
        return { error: "Generate the character headshot first." };
      }
      return {
        prompt: costumePreviewPrompt(character.name, description),
        refImageUrls: [headshotUrl],
      };
    }
    default:
      return { error: `Image retry is not supported for ${ingredient.kind} ingredients.` };
  }
}

export async function retryIngredientImageGeneration(
  ingredientId: string,
  revalidatePath?: string,
): Promise<{ status: "ready" | "failed"; error?: string }> {
  const built = await buildIngredientImageRetryInput(ingredientId);
  if ("error" in built) {
    return { status: "failed", error: built.error };
  }

  await updateIngredient(ingredientId, {
    generation_status: "pending",
    generation_error: null,
  });

  const result = await executeIngredientImageGeneration({
    ingredientId,
    prompt: built.prompt,
    refImageUrls: built.refImageUrls,
  });

  if (revalidatePath) {
    const { revalidatePath: revalidate } = await import("next/cache");
    revalidate(revalidatePath);
  }

  return result;
}
