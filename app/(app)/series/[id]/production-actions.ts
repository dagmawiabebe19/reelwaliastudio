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
  LOCATION_ESTABLISHING_PREFIX,
  costumePreviewPrompt,
} from "@/lib/production/prompts";
import { buildCharacterHeadshotPrompt } from "@/lib/production/headshot-prompt";
import { createIngredient, getIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import { queueIngredientImageGeneration, getIngredientRefUrl } from "@/lib/ai/generation/ingredient-generation";
import { createCharacterSheet, getCharacterSheet } from "@/lib/db/character-sheets";
import {
  queueSheetGeneration,
  regenerateSheetInPlace,
  retrySheetGeneration,
} from "@/lib/ai/generation/sheet-generation";
import {
  retryIngredientImageGeneration,
} from "@/lib/ai/generation/ingredient-generation";
import { bindSheetToScene } from "@/lib/db/scene-sheets";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { isSheetReadyForBinding } from "@/lib/production/reference-readiness";

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

    const series = await import("@/lib/db/series").then((m) => m.getSeries(seriesId));
    const { normalizeReferenceStyle } = await import("@/lib/production/reference-style");
    const prompt = buildCharacterHeadshotPrompt(description, {
      referenceStyle: normalizeReferenceStyle(series?.reference_style),
    });
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
    const sheet = await getCharacterSheet(sheetId);
    if (!sheet || !isSheetReadyForBinding(sheet)) {
      return { error: "Only ready character sheets can be bound. Retry or delete failed sheets first." };
    }
    await bindSheetToScene(sceneId, sheetId, "identity_lock");
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to bind sheet." };
  }
}

export async function retryCharacterSheetAction(sheetId: string, seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const userId = await getActiveUserId();
    await assertSufficientCredits(userId, estimateSheetCredits());

    const sheet = await getCharacterSheet(sheetId);
    if (!sheet) return { error: "Character sheet not found." };
    if (sheet.status === "pending") return { error: "Sheet is already generating." };

    const result = await retrySheetGeneration(sheetId, `/series/${seriesId}`);
    if (result.status === "failed") {
      return { error: result.error ?? "Sheet generation failed." };
    }
    return { sheetId, status: result.status };
  } catch (error) {
    return formatActionError(error, "Failed to retry character sheet.");
  }
}

export async function retryIngredientAction(ingredientId: string, seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const ingredient = await getIngredient(ingredientId);
    if (!ingredient) return { error: "Ingredient not found." };
    if (ingredient.generation_status === "pending") {
      return { error: "Ingredient is already generating." };
    }
    if (ingredient.generation_status !== "failed") {
      return { error: "Only failed ingredients can be retried." };
    }

    if (ingredient.kind === "voice") {
      const { retryVoiceAction } = await import("@/app/(app)/series/[id]/voice-actions");
      return retryVoiceAction(ingredientId, seriesId);
    }

    const userId = await getActiveUserId();
    await assertSufficientCredits(userId, estimateImageCredits(1));

    const result = await retryIngredientImageGeneration(
      ingredientId,
      `/series/${seriesId}`,
    );
    if (result.status === "failed") {
      return { error: result.error ?? "Generation failed." };
    }
    return { ingredientId, status: result.status };
  } catch (error) {
    return formatActionError(error, "Failed to retry ingredient.");
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

/**
 * One-click mitigation for Seedance real-person likeness rejections:
 * regenerate matching character headshots (and sheets) with likeness-safe prompts.
 */
export async function regenerateLikenessSafeReferencesAction(
  seriesId: string,
  referenceLabels: string[],
) {
  try {
    await verifySeriesOwnership(seriesId);
    const userId = await getActiveUserId();
    const labels = referenceLabels.map((label) => label.trim()).filter(Boolean);
    if (!labels.length) {
      return { error: "No reference labels to regenerate." };
    }

    const { listIngredientsBySeries } = await import("@/lib/db/ingredients");
    const { listCharacterSheetsBySeries } = await import("@/lib/db/character-sheets");
    const { normalizeRefKey } = await import("@/lib/ai/copilot/resolve-entity");

    const ingredients = await listIngredientsBySeries(seriesId);
    const sheets = await listCharacterSheetsBySeries(seriesId);

    const matchedCharacterIds = new Set<string>();
    const queued: string[] = [];
    const errors: string[] = [];

    for (const label of labels) {
      const primary = label.replace(/\(headshot.*?\)/gi, "").split("·")[0] ?? label;
      const norm = normalizeRefKey(primary);
      for (const ing of ingredients) {
        if (ing.kind !== "character") continue;
        const nameNorm = normalizeRefKey(ing.name);
        if (nameNorm === norm || normalizeRefKey(ing.ref_tag) === norm || norm.includes(nameNorm)) {
          matchedCharacterIds.add(ing.id);
        }
      }
      for (const sheet of sheets) {
        const charName = sheet.character?.name;
        if (!charName) continue;
        const charNorm = normalizeRefKey(charName);
        if (norm.includes(charNorm) || charNorm === norm) {
          matchedCharacterIds.add(sheet.character_id);
        }
      }
    }

    if (!matchedCharacterIds.size) {
      return {
        error: `No characters matched reference labels: ${labels.join("; ")}. Regenerate the flagged headshot/sheet from the Characters section.`,
      };
    }

    await assertSufficientCredits(
      userId,
      estimateImageCredits(matchedCharacterIds.size) +
        estimateSheetCredits() * Math.max(1, matchedCharacterIds.size),
    );

    for (const characterId of matchedCharacterIds) {
      const character = ingredients.find((ing) => ing.id === characterId);
      if (!character) continue;

      if (character.generation_status !== "pending") {
        const headshot = await retryIngredientImageGeneration(characterId, `/series/${seriesId}`, {
          markFalSafeStyled: true,
        });
        if (headshot.status === "failed") {
          errors.push(`${character.name} headshot: ${headshot.error ?? "failed"}`);
        } else {
          queued.push(`${character.name} headshot`);
        }
      }

      const charSheets = sheets.filter((sheet) => sheet.character_id === characterId);
      for (const sheet of charSheets) {
        if (sheet.status === "pending") continue;
        const sheetResult = await regenerateSheetInPlace(sheet.id, `/series/${seriesId}`, {
          markFalSafeStyled: true,
        });
        if (sheetResult.status === "failed") {
          errors.push(`${character.name} sheet (${sheet.name}): ${sheetResult.error ?? "failed"}`);
        } else {
          queued.push(`${character.name} sheet (${sheet.name})`);
        }
      }
    }

    revalidatePath(`/series/${seriesId}`);
    return {
      queued,
      errors,
      note: "References regenerated with likeness-safe prompts. Generate the take again after they finish.",
    };
  } catch (error) {
    return formatActionError(error, "Failed to regenerate likeness-safe references.");
  }
}
