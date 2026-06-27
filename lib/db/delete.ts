import "server-only";

import { deleteAssetsByIds } from "@/lib/db/asset-cleanup";
import {
  getCharacterSheet,
  listCharacterSheetsByCharacter,
  listCharacterSheetsByCostume,
} from "@/lib/db/character-sheets";
import { getDbClient } from "@/lib/db/client";
import {
  getIngredient,
  listCostumesByCharacter,
  verifySeriesOwnership,
} from "@/lib/db/ingredients";

async function collectIngredientAssetIds(ingredientId: string): Promise<string[]> {
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient) throw new Error("Ingredient not found.");

  const assetIds = new Set<string>();
  if (ingredient.primary_asset_id) assetIds.add(ingredient.primary_asset_id);

  if (ingredient.kind === "character") {
    const costumes = await listCostumesByCharacter(ingredientId);
    for (const costume of costumes) {
      if (costume.primary_asset_id) assetIds.add(costume.primary_asset_id);
    }

    const sheets = await listCharacterSheetsByCharacter(ingredientId);
    for (const sheet of sheets) {
      for (const angle of sheet.angles) {
        assetIds.add(angle.asset_id);
      }
    }
  } else if (ingredient.kind === "outfit") {
    const sheets = await listCharacterSheetsByCostume(ingredientId);
    for (const sheet of sheets) {
      for (const angle of sheet.angles) {
        assetIds.add(angle.asset_id);
      }
    }
  }

  return [...assetIds];
}

export async function deleteIngredientWithCleanup(
  ingredientId: string,
  seriesId: string,
): Promise<void> {
  await verifySeriesOwnership(seriesId);
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient || ingredient.series_id !== seriesId) {
    throw new Error("Ingredient not found.");
  }

  const assetIds = await collectIngredientAssetIds(ingredientId);

  const supabase = await getDbClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", ingredientId);
  if (error) throw new Error(error.message);

  await deleteAssetsByIds(assetIds);
}

export async function deleteCharacterSheetWithCleanup(
  sheetId: string,
  seriesId: string,
): Promise<void> {
  await verifySeriesOwnership(seriesId);
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet || sheet.series_id !== seriesId) {
    throw new Error("Character sheet not found.");
  }

  const assetIds = sheet.angles.map((angle) => angle.asset_id);

  const supabase = await getDbClient();
  const { error } = await supabase.from("character_sheets").delete().eq("id", sheetId);
  if (error) throw new Error(error.message);

  await deleteAssetsByIds(assetIds);
}

export async function deleteTakeWithCleanup(takeId: string, episodeId: string): Promise<void> {
  const { verifyTakeOwnership, deleteTake } = await import("@/lib/db/takes");
  await verifyTakeOwnership(takeId, episodeId);

  const assetId = await deleteTake(takeId);
  if (assetId) await deleteAssetsByIds([assetId]);
}

export async function deleteAudioLineWithCleanup(
  lineId: string,
  episodeId: string,
): Promise<void> {
  const { verifyEpisodeOwnership, getAudioLine, deleteAudioLine } = await import(
    "@/lib/db/audio-lines"
  );
  await verifyEpisodeOwnership(episodeId);

  const line = await getAudioLine(lineId);
  if (!line || line.episode_id !== episodeId) {
    throw new Error("Audio line not found.");
  }

  const assetId = await deleteAudioLine(lineId);
  if (assetId) await deleteAssetsByIds([assetId]);
}
