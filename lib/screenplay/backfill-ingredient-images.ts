import "server-only";

import {
  buildIngredientImageRetryInput,
  executeIngredientImageGeneration,
  queueIngredientImageGeneration,
} from "@/lib/ai/generation/ingredient-generation";
import { listIngredientsBySeries, updateIngredient } from "@/lib/db/ingredients";

/** Ingredients marked ready but with no stored image (breakdown approval bug). */
export async function listIngredientsMissingImages(
  seriesId: string,
): Promise<Awaited<ReturnType<typeof listIngredientsBySeries>>> {
  const ingredients = await listIngredientsBySeries(seriesId);
  return ingredients.filter(
    (ing) =>
      (ing.kind === "character" || ing.kind === "location") &&
      !ing.primary_asset_id &&
      ing.generation_status !== "pending",
  );
}

/** Queue async image generation for ingredients that were marked ready without assets. */
export async function requeueMissingIngredientImages(input: {
  seriesId: string;
  revalidatePath?: string;
}): Promise<{ queued: number; errors: string[] }> {
  const targets = await listIngredientsMissingImages(input.seriesId);
  let queued = 0;
  const errors: string[] = [];

  for (const ingredient of targets) {
    const built = await buildIngredientImageRetryInput(ingredient.id);
    if ("error" in built) {
      errors.push(`${ingredient.name}: ${built.error}`);
      continue;
    }

    await queueIngredientImageGeneration({
      ingredientId: ingredient.id,
      prompt: built.prompt,
      refImageUrls: built.refImageUrls,
      revalidatePath: input.revalidatePath ?? `/series/${input.seriesId}`,
    });
    queued += 1;
  }

  return { queued, errors };
}

/** Script/ops backfill: run generation inline (no Next after()). */
export async function backfillIngredientImages(input: {
  seriesId: string;
  userId: string;
  ingredientIds?: string[];
}): Promise<{ queued: number; errors: string[] }> {
  const candidates = await listIngredientsMissingImages(input.seriesId);
  const targets = input.ingredientIds
    ? candidates.filter((ing) => input.ingredientIds!.includes(ing.id))
    : candidates;

  let queued = 0;
  const errors: string[] = [];

  for (const ingredient of targets) {
    const built = await buildIngredientImageRetryInput(ingredient.id);
    if ("error" in built) {
      errors.push(`${ingredient.name}: ${built.error}`);
      continue;
    }

    await updateIngredient(ingredient.id, {
      generation_status: "pending",
      generation_error: null,
    });

    const result = await executeIngredientImageGeneration({
      ingredientId: ingredient.id,
      prompt: built.prompt,
      refImageUrls: built.refImageUrls,
      userId: input.userId,
    });

    if (result.status === "failed") {
      errors.push(`${ingredient.name}: ${result.error ?? "Generation failed"}`);
    } else {
      queued += 1;
    }
  }

  return { queued, errors };
}
