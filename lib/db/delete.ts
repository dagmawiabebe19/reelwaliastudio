import "server-only";

import { deleteAssetsByIds } from "@/lib/db/asset-cleanup";
import {
  getCharacterSheet,
  listCharacterSheetsByCharacter,
  listCharacterSheetsByCostume,
} from "@/lib/db/character-sheets";
import { getDbClient } from "@/lib/db/client";
import { getScene } from "@/lib/db/scenes";
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

export async function clearFailedTakesWithCleanup(
  sceneId: string,
  episodeId: string,
): Promise<number> {
  const { verifyEpisodeOwnership } = await import("@/lib/db/audio-lines");
  await verifyEpisodeOwnership(episodeId);

  const supabase = await getDbClient();
  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("id")
    .eq("id", sceneId)
    .eq("episode_id", episodeId)
    .maybeSingle();

  if (sceneError) throw new Error(sceneError.message);
  if (!scene) throw new Error("Scene not found.");

  const { listTakesByScene, deleteTake } = await import("@/lib/db/takes");
  const takes = await listTakesByScene(sceneId);
  const failedTakes = takes.filter((take) => take.status === "failed");

  const assetIds: string[] = [];
  for (const take of failedTakes) {
    const assetId = await deleteTake(take.id);
    if (assetId) assetIds.push(assetId);
  }

  if (assetIds.length) {
    await deleteAssetsByIds(assetIds);
  }

  return failedTakes.length;
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

export async function deleteSceneWithCleanup(sceneId: string): Promise<string> {
  const scene = await getScene(sceneId);
  if (!scene) {
    throw new Error("Scene not found.");
  }

  const { verifyEpisodeOwnership } = await import("@/lib/db/audio-lines");
  await verifyEpisodeOwnership(scene.episode_id);

  const { listTakesByScene, deleteTake } = await import("@/lib/db/takes");
  const takes = await listTakesByScene(sceneId);
  const assetIds: string[] = [];

  for (const take of takes) {
    const assetId = await deleteTake(take.id);
    if (assetId) assetIds.push(assetId);
  }

  const supabase = await getDbClient();
  const { error } = await supabase.from("scenes").delete().eq("id", sceneId);
  if (error) throw new Error(error.message);

  if (assetIds.length) {
    await deleteAssetsByIds(assetIds);
  }

  return scene.episode_id;
}

export async function deleteEpisodeWithCleanup(
  episodeId: string,
  seriesId: string,
): Promise<void> {
  const { verifyEpisodeOwnership } = await import("@/lib/db/audio-lines");
  const { getEpisode } = await import("@/lib/db/episodes");
  const { listScenesByEpisode } = await import("@/lib/db/scenes");
  const { listAudioLinesByEpisode } = await import("@/lib/db/audio-lines");

  await verifyEpisodeOwnership(episodeId);
  const episode = await getEpisode(episodeId);
  if (!episode || episode.series_id !== seriesId) {
    throw new Error("Episode not found.");
  }

  const scenes = await listScenesByEpisode(episodeId);
  const sceneIds = scenes.map((scene) => scene.id);

  for (const scene of scenes) {
    await deleteSceneWithCleanup(scene.id);
  }

  const audioLines = await listAudioLinesByEpisode(episodeId);
  for (const line of audioLines) {
    await deleteAudioLineWithCleanup(line.id, episodeId);
  }

  const supabase = await getDbClient();

  const { data: exports, error: exportsError } = await supabase
    .from("episode_exports")
    .select("id, asset_id")
    .eq("episode_id", episodeId);
  if (exportsError) throw new Error(exportsError.message);

  const exportAssetIds = (exports ?? [])
    .map((row) => row.asset_id)
    .filter((id): id is string => Boolean(id));

  if (exports?.length) {
    const { error: deleteExportsError } = await supabase
      .from("episode_exports")
      .delete()
      .eq("episode_id", episodeId);
    if (deleteExportsError) throw new Error(deleteExportsError.message);
  }

  if (exportAssetIds.length) {
    await deleteAssetsByIds(exportAssetIds);
  }

  const { error: episodeChatError } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("scope_type", "episode")
    .eq("scope_id", episodeId);
  if (episodeChatError) throw new Error(episodeChatError.message);

  if (sceneIds.length) {
    const { error: sceneChatError } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("scope_type", "scene")
      .in("scope_id", sceneIds);
    if (sceneChatError) throw new Error(sceneChatError.message);
  }

  const { error } = await supabase.from("episodes").delete().eq("id", episodeId);
  if (error) throw new Error(error.message);
}
