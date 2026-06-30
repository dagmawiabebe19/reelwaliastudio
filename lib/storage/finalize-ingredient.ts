import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { createAsset } from "@/lib/db/assets";
import { createIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import type { IngredientKind } from "@/lib/db/types";
import { bucketForIngredient, detectMediaType } from "@/lib/storage/buckets";

export async function finalizeIngredientUpload(input: {
  seriesId: string;
  kind: IngredientKind;
  bucket: string;
  storagePath: string;
  name: string;
  description?: string;
  contentType: string;
  width?: number | null;
  height?: number | null;
}) {
  await verifySeriesOwnership(input.seriesId);

  const ownerId = await getActiveUserId();
  const expectedPrefix = `${ownerId}/${input.seriesId}/${input.kind}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) {
    throw new Error("Storage path does not match the prepared upload.");
  }

  const expectedBucket = bucketForIngredient(input.kind);
  if (input.bucket !== expectedBucket) {
    throw new Error("Bucket does not match ingredient kind.");
  }

  const mediaType = detectMediaType(input.contentType);
  const asset = await createAsset({
    bucket: input.bucket,
    storagePath: input.storagePath,
    mediaType,
    width: input.width ?? null,
    height: input.height ?? null,
  });

  return createIngredient({
    seriesId: input.seriesId,
    kind: input.kind,
    name: input.name,
    description: input.description,
    primaryAssetId: asset.id,
    mediaType,
  });
}
