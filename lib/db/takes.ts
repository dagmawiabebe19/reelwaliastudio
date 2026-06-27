import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { Take, TakeMediaType, TakeStatus, TablesInsert } from "@/lib/db/database.types";

export type TakeWithAsset = Take & {
  assets: {
    id: string;
    bucket: string;
    storage_path: string;
    media_type: string;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
  } | null;
};

export async function listTakesByScene(sceneId: string): Promise<TakeWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("takes")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type, width, height, duration_ms)")
    .eq("scene_id", sceneId)
    .order("take_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TakeWithAsset[];
}

export async function listTakesForScenes(sceneIds: string[]): Promise<TakeWithAsset[]> {
  if (!sceneIds.length) return [];
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("takes")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type, width, height, duration_ms)")
    .in("scene_id", sceneIds)
    .order("take_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TakeWithAsset[];
}

export async function getTake(id: string): Promise<TakeWithAsset | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("takes")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type, width, height, duration_ms)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as TakeWithAsset | null;
}

export async function nextTakeNumber(sceneId: string): Promise<number> {
  const supabase = await getDbClient();
  const { count } = await supabase
    .from("takes")
    .select("id", { count: "exact", head: true })
    .eq("scene_id", sceneId);

  return (count ?? 0) + 1;
}

export async function createTake(input: {
  sceneId: string;
  mediaType: TakeMediaType;
  model?: string;
  resolution?: string;
  durationSeconds?: number | null;
  status?: TakeStatus;
  takeNumber?: number;
}): Promise<Take> {
  const supabase = await getDbClient();
  const takeNumber = input.takeNumber ?? (await nextTakeNumber(input.sceneId));

  const payload: TablesInsert<"takes"> = {
    scene_id: input.sceneId,
    take_number: takeNumber,
    media_type: input.mediaType,
    model: input.model ?? null,
    resolution: input.resolution ?? null,
    duration_seconds: input.durationSeconds ?? null,
    status: input.status ?? "pending",
  };

  const { data, error } = await supabase.from("takes").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTake(
  id: string,
  patch: Partial<
    Pick<Take, "asset_id" | "status" | "starred" | "error_message" | "model" | "resolution" | "duration_seconds">
  >,
): Promise<Take> {
  const supabase = await getDbClient();
  const { data, error } = await supabase.from("takes").update(patch).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setTakeStarred(id: string, starred: boolean): Promise<Take> {
  return updateTake(id, { starred });
}

export async function markTakeFailed(id: string, errorMessage: string): Promise<Take> {
  return updateTake(id, { status: "failed", error_message: errorMessage });
}

export async function markTakeReady(id: string, assetId: string): Promise<Take> {
  return updateTake(id, { status: "ready", asset_id: assetId, error_message: null });
}

export async function listStarredTakesByEpisode(episodeId: string): Promise<TakeWithAsset[]> {
  const supabase = await getDbClient();
  const { data: scenes, error: sceneError } = await supabase
    .from("scenes")
    .select("id, sort_order, position")
    .eq("episode_id", episodeId)
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  if (sceneError) throw new Error(sceneError.message);
  if (!scenes?.length) return [];

  const sceneIds = scenes.map((s) => s.id);
  const { data, error } = await supabase
    .from("takes")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type, width, height, duration_ms)")
    .in("scene_id", sceneIds)
    .eq("starred", true)
    .eq("status", "ready");

  if (error) throw new Error(error.message);

  const sceneOrder = new Map(scenes.map((s, i) => [s.id, i]));
  return ((data ?? []) as TakeWithAsset[]).sort((a, b) => {
    const orderA = sceneOrder.get(a.scene_id) ?? 0;
    const orderB = sceneOrder.get(b.scene_id) ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.take_number - b.take_number;
  });
}

export async function listStarredTakesByScene(sceneId: string): Promise<TakeWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("takes")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type, width, height, duration_ms)")
    .eq("scene_id", sceneId)
    .eq("starred", true)
    .eq("status", "ready")
    .order("take_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TakeWithAsset[];
}
