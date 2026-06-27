"use server";

import { revalidatePath } from "next/cache";
import { createAudioLine } from "@/lib/db/audio-lines";
import { createAsset } from "@/lib/db/assets";
import { bindIngredientToScene, unbindIngredientFromScene } from "@/lib/db/scene-ingredients";
import {
  archiveScene,
  createScene,
  reorderScenes,
  unarchiveScene,
  updateScene,
} from "@/lib/db/scenes";
import { bucketForAudioLine, buildStoragePath, detectMediaType } from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";
import { getActiveUserId } from "@/lib/auth/active-user";
import { randomUUID } from "crypto";
import type { Orientation } from "@/lib/db/types";

export async function createSceneAction(episodeId: string, seriesId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const actLabel = String(formData.get("actLabel") ?? "Storyboard-only").trim();
  if (!title) return { error: "Scene title is required." };

  try {
    await createScene(episodeId, { title, actLabel });
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create scene." };
  }
}

export async function updateSceneAction(
  sceneId: string,
  episodeId: string,
  seriesId: string,
  patch: {
    prompt?: string;
    duration_seconds?: number | null;
    orientation?: Orientation | null;
    title?: string;
    act_label?: string;
  },
) {
  try {
    await updateScene(sceneId, patch);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update scene." };
  }
}

export async function reorderScenesAction(
  episodeId: string,
  seriesId: string,
  orderedSceneIds: string[],
) {
  try {
    await reorderScenes(episodeId, orderedSceneIds);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reorder failed." };
  }
}

export async function archiveSceneAction(sceneId: string, episodeId: string, seriesId: string) {
  try {
    await archiveScene(sceneId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Archive failed." };
  }
}

export async function unarchiveSceneAction(sceneId: string, episodeId: string, seriesId: string) {
  try {
    await unarchiveScene(sceneId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unarchive failed." };
  }
}

export async function bindMentionAction(
  sceneId: string,
  ingredientId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await bindIngredientToScene(sceneId, ingredientId, "identity_lock");
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Bind failed." };
  }
}

export async function unbindMentionAction(
  sceneId: string,
  ingredientId: string,
  episodeId: string,
  seriesId: string,
) {
  try {
    await unbindIngredientFromScene(sceneId, ingredientId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unbind failed." };
  }
}

export async function uploadAudioLineAction(episodeId: string, seriesId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const file = formData.get("file");
  if (!title) return { error: "Title is required." };
  if (!(file instanceof File)) return { error: "Audio file is required." };

  try {
    const ownerId = await getActiveUserId();
    const bucket = bucketForAudioLine();
    const ext = file.name.split(".").pop() ?? "mp3";
    const filename = `${randomUUID()}.${ext}`;
    const storagePath = buildStoragePath(ownerId, episodeId, filename);
    const supabase = await getStorageClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const asset = await createAsset({
      bucket,
      storagePath,
      mediaType: detectMediaType(file.type),
    });

    await createAudioLine({
      episodeId,
      title,
      description: description || undefined,
      assetId: asset.id,
    });

    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload failed." };
  }
}

export async function getAudioDownloadUrlAction(episodeId: string, assetId: string) {
  void episodeId;
  const { getAsset } = await import("@/lib/db/assets");
  const { getSignedUrl } = await import("@/lib/storage/signed-url");
  const asset = await getAsset(assetId);
  if (!asset) return { error: "Asset not found." };
  const url = await getSignedUrl(asset.bucket, asset.storage_path);
  return { url };
}
