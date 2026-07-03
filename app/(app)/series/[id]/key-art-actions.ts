"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getActiveUserId } from "@/lib/auth/getUser";
import { createAsset } from "@/lib/db/assets";
import { getIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import { updateSeries } from "@/lib/db/series";
import { detectMediaType } from "@/lib/storage/buckets";

const MAX_KEY_ART_BYTES = 52_428_800;

export async function prepareKeyArtUploadAction(
  seriesId: string,
  input: { filename: string; contentType: string; contentLength: number },
) {
  try {
    await verifySeriesOwnership(seriesId);
    const ownerId = await getActiveUserId();

    if (input.contentLength > MAX_KEY_ART_BYTES) {
      return { error: "Image exceeds the 50 MB limit." };
    }

    if (!input.contentType.startsWith("image/")) {
      return { error: "Key art must be an image file." };
    }

    const ext = input.filename.includes(".")
      ? input.filename.slice(input.filename.lastIndexOf("."))
      : "";
    const storagePath = `${ownerId}/${seriesId}/key-art/${randomUUID()}${ext}`;

    return {
      uploadMethod: "direct" as const,
      bucket: "assets" as const,
      storagePath,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to prepare upload.",
    };
  }
}

export async function finalizeKeyArtUploadAction(
  seriesId: string,
  input: {
    bucket: string;
    storagePath: string;
    contentType: string;
    width?: number | null;
    height?: number | null;
  },
) {
  try {
    await verifySeriesOwnership(seriesId);
    const ownerId = await getActiveUserId();
    const expectedPrefix = `${ownerId}/${seriesId}/key-art/`;
    if (!input.storagePath.startsWith(expectedPrefix)) {
      return { error: "Storage path does not match the prepared upload." };
    }
    if (input.bucket !== "assets") {
      return { error: "Invalid bucket for key art." };
    }

    const mediaType = detectMediaType(input.contentType);
    if (mediaType !== "image") {
      return { error: "Key art must be an image." };
    }

    const asset = await createAsset({
      bucket: input.bucket,
      storagePath: input.storagePath,
      mediaType,
      width: input.width ?? null,
      height: input.height ?? null,
    });

    await updateSeries(seriesId, { thumbnail_asset_id: asset.id });
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save key art.",
    };
  }
}

export async function setKeyArtFromIngredientAction(seriesId: string, ingredientId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const ingredient = await getIngredient(ingredientId);
    if (!ingredient || ingredient.series_id !== seriesId) {
      return { error: "Ingredient not found." };
    }
    if (!ingredient.primary_asset_id) {
      return { error: "This ingredient has no image to use as key art." };
    }

    await updateSeries(seriesId, { thumbnail_asset_id: ingredient.primary_asset_id });
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to assign key art.",
    };
  }
}

export async function clearKeyArtAction(seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    await updateSeries(seriesId, { thumbnail_asset_id: null });
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to clear key art.",
    };
  }
}
