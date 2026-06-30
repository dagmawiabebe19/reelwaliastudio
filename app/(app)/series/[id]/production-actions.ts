"use server";

import { revalidatePath } from "next/cache";
import { getActiveUserId } from "@/lib/auth/getUser";
import { formatActionError } from "@/lib/credits/action-result";
import { assertSufficientCredits } from "@/lib/credits/meter";
import {
  estimateImageCredits,
  estimateSheetCredits,
} from "@/lib/credits/pricing";
import {
  CHARACTER_HEADSHOT_PREFIX,
  LOCATION_ESTABLISHING_PREFIX,
  costumePreviewPrompt,
} from "@/lib/production/prompts";
import { createIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import { queueIngredientImageGeneration, getIngredientRefUrl } from "@/lib/ai/generation/ingredient-generation";
import { createCharacterSheet } from "@/lib/db/character-sheets";
import { queueSheetGeneration } from "@/lib/ai/generation/sheet-generation";
import { bindSheetToScene } from "@/lib/db/scene-sheets";
import { resolveSceneReferences } from "@/lib/production/resolve-references";

export async function generateCharacterAction(seriesId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !description) return { error: "Name and description are required." };

  try {
    await verifySeriesOwnership(seriesId);
    const userId = await getActiveUserId();
    const estimate = estimateImageCredits(1);
    await assertSufficientCredits(userId, estimate);

    const ingredient = await createIngredient({
      seriesId,
      kind: "character",
      name,
      description,
      generationStatus: "pending",
    });

    const prompt = `${CHARACTER_HEADSHOT_PREFIX}${description}`;
    await queueIngredientImageGeneration({
      ingredientId: ingredient.id,
      prompt,
      revalidatePath: `/series/${seriesId}`,
    });

    revalidatePath(`/series/${seriesId}`);
    return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag, estimatedCredits: estimate };
  } catch (error) {
    return formatActionError(error, "Failed to generate character.");
  }
}

export async function generateLocationAction(seriesId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !description) return { error: "Name and description are required." };

  try {
    await verifySeriesOwnership(seriesId);
    const userId = await getActiveUserId();
    const estimate = estimateImageCredits(1);
    await assertSufficientCredits(userId, estimate);

    const ingredient = await createIngredient({
      seriesId,
      kind: "location",
      name,
      description,
      generationStatus: "pending",
    });

    const prompt = `${LOCATION_ESTABLISHING_PREFIX}${description}`;
    await queueIngredientImageGeneration({
      ingredientId: ingredient.id,
      prompt,
      revalidatePath: `/series/${seriesId}`,
    });

    revalidatePath(`/series/${seriesId}`);
    return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag, estimatedCredits: estimate };
  } catch (error) {
    return formatActionError(error, "Failed to generate location.");
  }
}

export async function generateCostumeAction(seriesId: string, formData: FormData) {
  const characterId = String(formData.get("characterId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!characterId || !name || !description) {
    return { error: "Character, name, and costume description are required." };
  }

  try {
    await verifySeriesOwnership(seriesId);
    const userId = await getActiveUserId();
    const estimate = estimateImageCredits(1);
    await assertSufficientCredits(userId, estimate);

    const { getIngredient } = await import("@/lib/db/ingredients");
    const character = await getIngredient(characterId);
    if (!character || character.kind !== "character") {
      return { error: "Character not found." };
    }

    const ingredient = await createIngredient({
      seriesId,
      kind: "outfit",
      name,
      description,
      characterId,
      generationStatus: "pending",
    });

    const headshotUrl = await getIngredientRefUrl(characterId);
    if (!headshotUrl) {
      return { error: "Generate the character headshot first." };
    }

    const prompt = costumePreviewPrompt(character.name, description);
    await queueIngredientImageGeneration({
      ingredientId: ingredient.id,
      prompt,
      refImageUrls: [headshotUrl],
      revalidatePath: `/series/${seriesId}`,
    });

    revalidatePath(`/series/${seriesId}`);
    return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag, estimatedCredits: estimate };
  } catch (error) {
    return formatActionError(error, "Failed to generate costume.");
  }
}

export async function createCharacterSheetAction(seriesId: string, formData: FormData) {
  const characterId = String(formData.get("characterId") ?? "").trim();
  const costumeId = String(formData.get("costumeId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const episodeIds = formData.getAll("episodeIds").map(String).filter(Boolean);

  if (!characterId || !name) return { error: "Character and sheet name are required." };

  try {
    await verifySeriesOwnership(seriesId);
    const userId = await getActiveUserId();
    const estimate = estimateSheetCredits();
    await assertSufficientCredits(userId, estimate);

    const sheet = await createCharacterSheet({
      seriesId,
      characterId,
      costumeId: costumeId || null,
      name,
      episodeIds,
    });

    await queueSheetGeneration(sheet.id, `/series/${seriesId}`);
    revalidatePath(`/series/${seriesId}`);
    return { sheetId: sheet.id, estimatedCredits: estimate };
  } catch (error) {
    return formatActionError(error, "Failed to create sheet.");
  }
}

export async function bindSheetAction(
  sceneId: string,
  sheetId: string,
  seriesId: string,
  episodeId: string,
) {
  try {
    await bindSheetToScene(sceneId, sheetId, "identity_lock");
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to bind sheet." };
  }
}

export async function resolveSceneReferencesAction(
  sceneId: string,
  seriesId: string,
  episodeId: string,
) {
  try {
    const refs = await resolveSceneReferences({
      sceneId,
      seriesId,
      episodeId,
      autoBind: true,
    });
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { references: refs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to resolve references." };
  }
}
