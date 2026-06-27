"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { isDevNoAuth } from "@/lib/auth/dev";
import { getActiveUserId } from "@/lib/auth/active-user";
import { createEpisode, updateEpisodeStatus } from "@/lib/db/episodes";
import { deleteIngredientWithCleanup } from "@/lib/db/delete";
import { updateIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import {
  updateSeriesBrief,
  updateSeriesOrientation,
} from "@/lib/db/series";
import { updateSeriesMemoryMarkdown } from "@/lib/db/series-memory";
import { finalizeIngredientUpload } from "@/lib/storage/finalize-ingredient";
import { bucketForIngredient } from "@/lib/storage/buckets";
import { buildIngredientStoragePath } from "@/lib/storage/paths";
import { getStorageClient } from "@/lib/storage/client";
import type { IngredientKind, Orientation } from "@/lib/db/types";
import type { StorageBucket } from "@/lib/storage/buckets";

const MAX_INGREDIENT_BYTES: Record<StorageBucket, number> = {
  assets: 52_428_800,
  references: 104_857_600,
  audio: 52_428_800,
};

export async function prepareIngredientUploadAction(
  seriesId: string,
  input: {
    kind: IngredientKind;
    filename: string;
    contentType: string;
    contentLength: number;
  },
) {
  try {
    await verifySeriesOwnership(seriesId);
    const ownerId = await getActiveUserId();
    const bucket = bucketForIngredient(input.kind);
    const maxBytes = MAX_INGREDIENT_BYTES[bucket];

    if (input.contentLength > maxBytes) {
      return {
        error: `File exceeds the ${Math.round(maxBytes / 1_048_576)} MB limit for this bucket.`,
      };
    }

    const storagePath = buildIngredientStoragePath(
      ownerId,
      seriesId,
      input.kind,
      input.filename,
      randomUUID(),
    );

    if (isDevNoAuth()) {
      const supabase = await getStorageClient();
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(storagePath);

      if (error || !data) {
        return { error: error?.message ?? "Failed to create signed upload URL." };
      }

      return {
        uploadMethod: "signed" as const,
        bucket,
        storagePath,
        signedUrl: data.signedUrl,
        token: data.token,
      };
    }

    return {
      uploadMethod: "direct" as const,
      bucket,
      storagePath,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to prepare upload.",
    };
  }
}

export async function finalizeIngredientUploadAction(
  seriesId: string,
  input: {
    kind: IngredientKind;
    bucket: string;
    storagePath: string;
    name: string;
    description?: string;
    contentType: string;
    width?: number | null;
    height?: number | null;
  },
) {
  try {
    await finalizeIngredientUpload({
      seriesId,
      kind: input.kind,
      bucket: input.bucket,
      storagePath: input.storagePath,
      name: input.name,
      description: input.description,
      contentType: input.contentType,
      width: input.width,
      height: input.height,
    });
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to register upload.",
    };
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
    await deleteIngredientWithCleanup(ingredientId, seriesId);
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

export async function updateSeriesMemoryAction(seriesId: string, memoryMarkdown: string) {
  try {
    await updateSeriesMemoryMarkdown(seriesId, memoryMarkdown);
    revalidatePath(`/series/${seriesId}`);
    revalidatePath(`/series/${seriesId}/episodes`, "layout");
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Save failed." };
  }
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
