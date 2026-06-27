"use server";

import { revalidatePath } from "next/cache";
import { createEpisode, updateEpisodeStatus } from "@/lib/db/episodes";
import { deleteIngredient, updateIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import {
  updateSeriesBrief,
  updateSeriesOrientation,
} from "@/lib/db/series";
import { uploadIngredientFile } from "@/lib/storage/upload";
import type { IngredientKind, Orientation } from "@/lib/db/types";

export async function uploadIngredientAction(seriesId: string, formData: FormData) {
  const kind = String(formData.get("kind") ?? "reference") as IngredientKind;
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided." };

  try {
    await verifySeriesOwnership(seriesId);
    await uploadIngredientFile({ seriesId, kind, file });
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }
}

export async function createEpisodeAction(seriesId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const logline = String(formData.get("logline") ?? "").trim();
  if (!title) return { error: "Episode title is required." };

  try {
    await verifySeriesOwnership(seriesId);
    await createEpisode(seriesId, title, logline || undefined);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create episode." };
  }
}

export async function setEpisodeStatusAction(
  episodeId: string,
  seriesId: string,
  status: "active" | "archived",
) {
  try {
    await updateEpisodeStatus(episodeId, status);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update episode." };
  }
}

export async function updateIngredientAction(
  ingredientId: string,
  seriesId: string,
  formData: FormData,
) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return { error: "Name is required." };

  try {
    await updateIngredient(ingredientId, { name, description: description || null });
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function deleteIngredientAction(ingredientId: string, seriesId: string) {
  try {
    await deleteIngredient(ingredientId);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Delete failed." };
  }
}

export async function saveSeriesBriefAction(seriesId: string, briefMarkdown: string) {
  try {
    await updateSeriesBrief(seriesId, briefMarkdown);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Save failed." };
  }
}

export async function updateSeriesBriefAction(seriesId: string, briefMarkdown: string) {
  return saveSeriesBriefAction(seriesId, briefMarkdown);
}

export async function updateSeriesOrientationAction(
  seriesId: string,
  orientation: Orientation,
) {
  try {
    await updateSeriesOrientation(seriesId, orientation);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update orientation.",
    };
  }
}
