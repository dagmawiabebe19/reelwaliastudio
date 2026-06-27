import "server-only";

import { randomUUID } from "crypto";
import { getActiveUserId } from "@/lib/auth/active-user";
import { createAsset } from "@/lib/db/assets";
import { createIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import type { IngredientKind } from "@/lib/db/types";
import {
  bucketForIngredient,
  buildStoragePath,
  detectMediaType,
} from "@/lib/storage/buckets";
import { getStorageClient } from "@/lib/storage/client";

export async function uploadIngredientFile(input: {
  seriesId: string;
  kind: IngredientKind;
  file: File;
  name?: string;
  description?: string;
}) {
  await verifySeriesOwnership(input.seriesId);

  const ownerId = await getActiveUserId();
  const mediaType = detectMediaType(input.file.type);
  const bucket = bucketForIngredient(input.kind);
  const ext = input.file.name.split(".").pop() ?? "bin";
  const filename = `${randomUUID()}.${ext}`;
  const storagePath = buildStoragePath(ownerId, input.seriesId, filename);

  const supabase = await getStorageClient();
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType: input.file.type, upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const asset = await createAsset({
    bucket,
    storagePath,
    mediaType,
  });

  const ingredient = await createIngredient({
    seriesId: input.seriesId,
    kind: input.kind,
    name: input.name ?? input.file.name.replace(/\.[^.]+$/, ""),
    description: input.description,
    primaryAssetId: asset.id,
    mediaType,
  });

  return ingredient;
}
