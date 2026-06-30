import "server-only";

import { randomUUID } from "crypto";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";
import type { Asset, AssetMediaType, TablesInsert } from "@/lib/db/database.types";

export async function createAsset(input: {
  bucket: string;
  storagePath: string;
  mediaType: AssetMediaType;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  source?: "uploaded" | "generated";
  model?: string | null;
  prompt?: string | null;
}): Promise<Asset> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const payload: TablesInsert<"assets"> = {
    owner_id: ownerId,
    bucket: input.bucket,
    storage_path: input.storagePath,
    media_type: input.mediaType,
    width: input.width ?? null,
    height: input.height ?? null,
    duration_ms: input.durationMs ?? null,
    source: input.source ?? "uploaded",
    model: input.model ?? null,
    prompt: input.prompt ?? null,
  };

  const { data, error } = await supabase.from("assets").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getAsset(id: string): Promise<Asset | null> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export function buildGeneratedAssetPath(
  ownerId: string,
  sceneId: string,
  ext: string,
  uuid: string = randomUUID(),
): string {
  return `${ownerId}/generated/${sceneId}/${uuid}.${ext}`;
}
