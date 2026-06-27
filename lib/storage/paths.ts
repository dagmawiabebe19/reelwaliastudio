import type { IngredientKind } from "@/lib/db/types";

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Owner-prefixed path for storage RLS: {owner_id}/{series_id}/{kind}/{uuid}-{filename} */
export function buildIngredientStoragePath(
  ownerId: string,
  seriesId: string,
  kind: IngredientKind,
  filename: string,
  uuid: string = crypto.randomUUID(),
): string {
  return `${ownerId}/${seriesId}/${kind}/${uuid}-${sanitizeFilename(filename)}`;
}
