import "server-only";

import { getDbClient } from "@/lib/db/client";
import {
  TAKE_SELECT_CORE,
  TAKE_SELECT_WITH_PROVIDER,
} from "@/lib/db/take-columns";
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

export const TAKE_PROVIDER_MIGRATION = "017_take_provider_request.sql";

export function isTakeProviderSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("provider_request_id") ||
    message.includes("provider_endpoint") ||
    message.includes("provider_submitted_at") ||
    message.includes("schema cache")
  );
}

export function logTakeProviderSchemaWarning(context: string): void {
  console.warn(
    `[takes] ${context} — apply supabase/migrations/${TAKE_PROVIDER_MIGRATION} in Supabase SQL Editor`,
  );
}

type TakeQueryRow = { data: unknown; error: { message: string } | null };

async function queryTakesWithFallback(
  run: (select: string) => PromiseLike<TakeQueryRow>,
): Promise<{ data: unknown; error: Error | null }> {
  const primary = await run(TAKE_SELECT_WITH_PROVIDER);
  if (!primary.error) {
    return { data: primary.data, error: null };
  }
  if (isTakeProviderSchemaError(primary.error)) {
    logTakeProviderSchemaWarning("take query degraded to core columns");
    const fallback = await run(TAKE_SELECT_CORE);
    if (fallback.error) {
      return { data: null, error: new Error(fallback.error.message) };
    }
    return { data: fallback.data, error: null };
  }
  return { data: null, error: new Error(primary.error.message) };
}

export async function listTakesByScene(sceneId: string): Promise<TakeWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await queryTakesWithFallback((select) =>
    supabase
      .from("takes")
      .select(select)
      .eq("scene_id", sceneId)
      .order("take_number", { ascending: true }),
  );
  if (error) throw error;
  return (data ?? []) as unknown as TakeWithAsset[];
}

export async function listTakesForScenes(sceneIds: string[]): Promise<TakeWithAsset[]> {
  if (!sceneIds.length) return [];
  const supabase = await getDbClient();
  const { data, error } = await queryTakesWithFallback((select) =>
    supabase
      .from("takes")
      .select(select)
      .in("scene_id", sceneIds)
      .order("take_number", { ascending: true }),
  );
  if (error) throw error;
  return (data ?? []) as unknown as TakeWithAsset[];
}

export async function getTake(id: string): Promise<TakeWithAsset | null> {
  const supabase = await getDbClient();
  const { data, error } = await queryTakesWithFallback((select) =>
    supabase.from("takes").select(select).eq("id", id).maybeSingle(),
  );
  if (error) throw error;
  return data as unknown as TakeWithAsset | null;
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
    Pick<
      Take,
      | "asset_id"
      | "status"
      | "starred"
      | "error_message"
      | "model"
      | "resolution"
      | "duration_seconds"
      | "has_audio"
      | "provider_request_id"
      | "provider_endpoint"
      | "provider_submitted_at"
    >
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

export async function markTakeReady(
  id: string,
  assetId: string,
  patch?: Pick<Take, "duration_seconds" | "has_audio">,
): Promise<Take> {
  return updateTake(id, {
    status: "ready",
    asset_id: assetId,
    error_message: null,
    ...patch,
  });
}

export async function setTakeProviderJob(
  id: string,
  input: {
    providerRequestId: string;
    providerEndpoint: string;
    providerSubmittedAt?: string;
  },
): Promise<Take | null> {
  try {
    return await updateTake(id, {
      provider_request_id: input.providerRequestId,
      provider_endpoint: input.providerEndpoint,
      provider_submitted_at: input.providerSubmittedAt ?? new Date().toISOString(),
    });
  } catch (error) {
    if (isTakeProviderSchemaError(error)) {
      logTakeProviderSchemaWarning("setTakeProviderJob skipped");
      return null;
    }
    throw error;
  }
}

export async function listStuckPendingTakes(
  input?: {
    episodeId?: string;
    seriesId?: string;
    olderThanMinutes?: number;
    takeIds?: string[];
  },
  db?: Awaited<ReturnType<typeof getDbClient>>,
): Promise<TakeWithAsset[]> {
  const supabase = db ?? (await getDbClient());
  const olderThanMinutes = input?.olderThanMinutes ?? 0;
  const cutoff =
    olderThanMinutes > 0
      ? new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
      : null;

  let sceneIds: string[] | null = null;
  if (input?.episodeId) {
    const { data: scenes, error: sceneError } = await supabase
      .from("scenes")
      .select("id")
      .eq("episode_id", input.episodeId);
    if (sceneError) throw new Error(sceneError.message);
    sceneIds = (scenes ?? []).map((scene) => scene.id);
    if (!sceneIds.length) return [];
  } else if (input?.seriesId) {
    const { data: episodes, error: episodeError } = await supabase
      .from("episodes")
      .select("id")
      .eq("series_id", input.seriesId);
    if (episodeError) throw new Error(episodeError.message);
    const episodeIds = (episodes ?? []).map((episode) => episode.id);
    if (!episodeIds.length) return [];
    const { data: scenes, error: sceneError } = await supabase
      .from("scenes")
      .select("id")
      .in("episode_id", episodeIds);
    if (sceneError) throw new Error(sceneError.message);
    sceneIds = (scenes ?? []).map((scene) => scene.id);
    if (!sceneIds.length) return [];
  }

  let query = supabase
    .from("takes")
    .select(TAKE_SELECT_WITH_PROVIDER)
    .eq("status", "pending")
    .eq("media_type", "video")
    .order("created_at", { ascending: true });

  if (input?.takeIds?.length) {
    query = query.in("id", input.takeIds);
  }
  if (sceneIds?.length) {
    query = query.in("scene_id", sceneIds);
  }
  if (cutoff) {
    query = query.lte("created_at", cutoff);
  }

  let { data, error } = await query;
  if (error && isTakeProviderSchemaError(error)) {
    logTakeProviderSchemaWarning("listStuckPendingTakes degraded to core columns");
    let coreQuery = supabase
      .from("takes")
      .select(TAKE_SELECT_CORE)
      .eq("status", "pending")
      .eq("media_type", "video")
      .order("created_at", { ascending: true });
    if (input?.takeIds?.length) coreQuery = coreQuery.in("id", input.takeIds);
    if (sceneIds?.length) coreQuery = coreQuery.in("scene_id", sceneIds);
    if (cutoff) coreQuery = coreQuery.lte("created_at", cutoff);
    ({ data, error } = await coreQuery);
  }
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as TakeWithAsset[];
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
    .select(TAKE_SELECT_CORE)
    .in("scene_id", sceneIds)
    .eq("starred", true)
    .eq("status", "ready");

  if (error) throw new Error(error.message);

  const sceneOrder = new Map(scenes.map((s, i) => [s.id, i]));
  return ((data ?? []) as unknown as TakeWithAsset[]).sort((a, b) => {
    const orderA = sceneOrder.get(a.scene_id) ?? 0;
    const orderB = sceneOrder.get(b.scene_id) ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.take_number - b.take_number;
  });
}

export async function deleteTake(id: string): Promise<string | null> {
  const take = await getTake(id);
  if (!take) throw new Error("Take not found.");

  const assetId = take.asset_id;
  const supabase = await getDbClient();
  const { error } = await supabase.from("takes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  return assetId;
}

export async function verifyTakeOwnership(takeId: string, episodeId: string): Promise<void> {
  const take = await getTake(takeId);
  if (!take) throw new Error("Take not found.");

  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scenes")
    .select("id, episode_id")
    .eq("id", take.scene_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.episode_id !== episodeId) throw new Error("Take not found.");

  const { verifyEpisodeOwnership } = await import("@/lib/db/audio-lines");
  await verifyEpisodeOwnership(episodeId);
}

export async function listStarredTakesByScene(sceneId: string): Promise<TakeWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("takes")
    .select(TAKE_SELECT_CORE)
    .eq("scene_id", sceneId)
    .eq("starred", true)
    .eq("status", "ready")
    .order("take_number", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TakeWithAsset[];
}
