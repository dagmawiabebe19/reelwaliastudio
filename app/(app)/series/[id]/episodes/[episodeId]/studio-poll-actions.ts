"use server";

import { listTakesForScenes } from "@/lib/db/takes";
import { getIngredient, listIngredientsBySeries, verifySeriesOwnership } from "@/lib/db/ingredients";
import { getCharacterSheet, listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { resolveAssetUrl } from "@/lib/storage/resolve-urls";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { formatActionError } from "@/lib/credits/action-result";

export type PolledTakeCard = {
  id: string;
  scene_id: string;
  take_number: number;
  media_type: "image" | "video";
  starred: boolean;
  status: string;
  error_message: string | null;
  assetUrl: string | null;
  model: string | null;
  has_audio: boolean;
};

export async function pollEpisodeTakesAction(input: {
  seriesId: string;
  episodeId: string;
  sceneIds: string[];
}) {
  try {
    await verifySeriesOwnership(input.seriesId);
    if (!input.sceneIds.length) {
      return { takesByScene: {} as Record<string, PolledTakeCard[]> };
    }

    const takes = await listTakesForScenes(input.sceneIds);
    const takesByScene: Record<string, PolledTakeCard[]> = {};
    for (const sceneId of input.sceneIds) {
      takesByScene[sceneId] = [];
    }

    for (const take of takes) {
      const assetUrl = take.assets
        ? await resolveAssetUrl(take.assets)
        : null;
      const card: PolledTakeCard = {
        id: take.id,
        scene_id: take.scene_id,
        take_number: take.take_number,
        media_type: take.media_type === "video" ? "video" : "image",
        starred: Boolean(take.starred),
        status: take.status,
        error_message: take.error_message,
        assetUrl,
        model: take.model,
        has_audio: Boolean(take.has_audio),
      };
      if (!takesByScene[take.scene_id]) takesByScene[take.scene_id] = [];
      takesByScene[take.scene_id].push(card);
    }

    return { takesByScene };
  } catch (error) {
    return formatActionError(error, "Failed to poll take status.");
  }
}

export type PolledLibraryStatus = {
  ingredients: Array<{
    id: string;
    generationStatus: string;
    generationError: string | null;
    assetUrl: string | null;
    mediaType: string | null;
  }>;
  sheets: Array<{
    id: string;
    status: string;
    generationError: string | null;
    angleUrls: Record<string, string | null>;
  }>;
};

export async function pollSeriesLibraryStatusAction(seriesId: string): Promise<
  | PolledLibraryStatus
  | { error: string }
> {
  try {
    await verifySeriesOwnership(seriesId);
    const [ingredients, sheets] = await Promise.all([
      listIngredientsBySeries(seriesId),
      listCharacterSheetsBySeries(seriesId),
    ]);

    const ingredientRows = await Promise.all(
      ingredients.map(async (ing) => {
        const assetUrl = ing.assets ? await resolveAssetUrl(ing.assets) : null;
        return {
          id: ing.id,
          generationStatus: ing.generation_status,
          generationError: ing.generation_error,
          assetUrl,
          mediaType: ing.assets?.media_type ?? null,
        };
      }),
    );

    const sheetRows = await Promise.all(
      sheets.map(async (sheet) => {
        const angleUrls: Record<string, string | null> = {};
        for (const angle of sheet.angles) {
          angleUrls[angle.angle_label] = angle.assets
            ? await getSignedUrl(angle.assets.bucket, angle.assets.storage_path)
            : null;
        }
        return {
          id: sheet.id,
          status: sheet.status,
          generationError: sheet.generation_error,
          angleUrls,
        };
      }),
    );

    return { ingredients: ingredientRows, sheets: sheetRows };
  } catch (error) {
    return formatActionError(error, "Failed to poll library status.");
  }
}

/** Lightweight poll for co-pilot output cards (status only; URLs only when needed). */
export async function pollCopilotItemStatusesAction(input: {
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
    return formatActionError(error, "Failed to poll co-pilot output.");
  }
}
