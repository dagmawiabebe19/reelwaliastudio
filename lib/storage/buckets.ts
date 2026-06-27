import type { AssetMediaType } from "@/lib/db/types";
import type { IngredientKind } from "@/lib/db/types";

export type StorageBucket = "assets" | "references" | "audio";

export function bucketForIngredient(kind: IngredientKind): StorageBucket {
  if (kind === "voice") return "audio";
  if (kind === "reference") return "references";
  return "assets";
}

export function bucketForAudioLine(): StorageBucket {
  return "audio";
}

export function detectMediaType(mimeType: string): AssetMediaType {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

export function buildStoragePath(
  ownerId: string,
  scopeId: string,
  filename: string,
): string {
  return `${ownerId}/${scopeId}/${filename}`;
}
