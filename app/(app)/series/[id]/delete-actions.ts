"use server";

import { revalidatePath } from "next/cache";
import {
  deleteAudioLineWithCleanup,
  deleteCharacterSheetWithCleanup,
  deleteIngredientWithCleanup,
  deleteSceneWithCleanup,
  deleteTakeWithCleanup,
} from "@/lib/db/delete";
import {
  getAudioLineDeletePreview,
  getCharacterSheetDeletePreview,
  getIngredientDeletePreview,
  getSceneDeletePreview,
  getTakeDeletePreview,
} from "@/lib/db/delete-preview";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { verifyEpisodeOwnership } from "@/lib/db/audio-lines";

export async function getIngredientDeletePreviewAction(ingredientId: string, seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    return await getIngredientDeletePreview(ingredientId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load preview." };
  }
}

export async function deleteIngredientWithCleanupAction(ingredientId: string, seriesId: string) {
  try {
    await deleteIngredientWithCleanup(ingredientId, seriesId);
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Delete failed." };
  }
}

export async function getCharacterSheetDeletePreviewAction(sheetId: string, seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    return await getCharacterSheetDeletePreview(sheetId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load preview." };
  }
}

export async function deleteCharacterSheetAction(sheetId: string, seriesId: string) {
  try {
    await deleteCharacterSheetWithCleanup(sheetId, seriesId);
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Delete failed." };
  }
}

export async function getTakeDeletePreviewAction(
  takeId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await verifyEpisodeOwnership(episodeId);
    void seriesId;
    return await getTakeDeletePreview(takeId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load preview." };
  }
}

export async function deleteTakeAction(
  takeId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await deleteTakeWithCleanup(takeId, episodeId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Delete failed." };
  }
}

export async function getAudioLineDeletePreviewAction(
  lineId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await verifyEpisodeOwnership(episodeId);
    void seriesId;
    return await getAudioLineDeletePreview(lineId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load preview." };
  }
}

export async function deleteAudioLineAction(
  lineId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await deleteAudioLineWithCleanup(lineId, episodeId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Delete failed." };
  }
}

export async function getSceneDeletePreviewAction(
  sceneId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await verifyEpisodeOwnership(episodeId);
    void seriesId;
    return await getSceneDeletePreview(sceneId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to load preview." };
  }
}

export async function deleteSceneAction(sceneId: string, seriesId: string) {
  try {
    const sceneEpisodeId = await deleteSceneWithCleanup(sceneId);
    revalidatePath(`/series/${seriesId}/episodes/${sceneEpisodeId}`);
    return { success: true as const, episodeId: sceneEpisodeId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Delete failed." };
  }
}
