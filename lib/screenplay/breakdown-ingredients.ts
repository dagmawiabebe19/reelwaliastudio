import "server-only";

import { queueIngredientImageGeneration } from "@/lib/ai/generation/ingredient-generation";
import { createIngredient } from "@/lib/db/ingredients";
import type { Ingredient } from "@/lib/db/database.types";
import { buildCharacterHeadshotPrompt } from "@/lib/production/headshot-prompt";
import { LOCATION_ESTABLISHING_PREFIX } from "@/lib/production/prompts";

export async function createBreakdownCharacterIngredient(input: {
  seriesId: string;
  name: string;
  description: string;
}): Promise<Ingredient> {
  const ingredient = await createIngredient({
    seriesId: input.seriesId,
    kind: "character",
    name: input.name,
    description: input.description,
    generationStatus: "pending",
  });

  const series = await import("@/lib/db/series").then((m) => m.getSeries(input.seriesId));
  const { normalizeReferenceStyle } = await import("@/lib/production/reference-style");
  await queueIngredientImageGeneration({
    ingredientId: ingredient.id,
    prompt: buildCharacterHeadshotPrompt(input.description, {
      referenceStyle: normalizeReferenceStyle(series?.reference_style),
    }),
    revalidatePath: `/series/${input.seriesId}`,
  });

  return ingredient;
}

export async function createBreakdownLocationIngredient(input: {
  seriesId: string;
  name: string;
  description: string;
}): Promise<Ingredient> {
  const ingredient = await createIngredient({
    seriesId: input.seriesId,
    kind: "location",
    name: input.name,
    description: input.description,
    generationStatus: "pending",
  });

  await queueIngredientImageGeneration({
    ingredientId: ingredient.id,
    prompt: `${LOCATION_ESTABLISHING_PREFIX}${input.description}`,
    revalidatePath: `/series/${input.seriesId}`,
  });

  return ingredient;
}
