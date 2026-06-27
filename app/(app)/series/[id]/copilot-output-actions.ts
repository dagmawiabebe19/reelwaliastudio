"use server";

import { getCharacterSheet } from "@/lib/db/character-sheets";
import { getIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import { getSignedUrl } from "@/lib/storage/signed-url";

export async function pollCopilotOutputAction(input: {
  seriesId: string;
  ingredientIds: string[];
  sheetIds: string[];
}) {
  try {
    await verifySeriesOwnership(input.seriesId);

    const ingredients = await Promise.all(
      input.ingredientIds.map(async (id) => {
        const ing = await getIngredient(id);
        if (!ing || ing.series_id !== input.seriesId) return null;
        const assetUrl = ing.assets
          ? await getSignedUrl(ing.assets.bucket, ing.assets.storage_path)
          : null;
        return {
          id: ing.id,
          name: ing.name,
          ingredientKind: ing.kind,
          refTag: ing.ref_tag,
          status: ing.generation_status,
          generationError: ing.generation_error,
          assetUrl,
        };
      }),
    );

    const sheets = await Promise.all(
      input.sheetIds.map(async (id) => {
        const sheet = await getCharacterSheet(id);
        if (!sheet || sheet.series_id !== input.seriesId) return null;

        const angleUrls: Record<string, string | null> = {};
        for (const angle of sheet.angles) {
          angleUrls[angle.angle_label] = angle.assets
            ? await getSignedUrl(angle.assets.bucket, angle.assets.storage_path)
            : null;
        }

        return {
          id: sheet.id,
          name: sheet.name,
          characterName: sheet.character?.name ?? null,
          costumeName: sheet.costume?.name ?? null,
          status: sheet.status,
          generationError: sheet.generation_error,
          angleUrls,
          angleCount: sheet.angles.length,
        };
      }),
    );

    return {
      ingredients: ingredients.filter(Boolean),
      sheets: sheets.filter(Boolean),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to refresh output." };
  }
}
