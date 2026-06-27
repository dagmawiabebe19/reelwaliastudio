import "server-only";

import { getActiveUserId } from "@/lib/auth/active-user";
import { getDbClient } from "@/lib/db/client";
import type { AudioLine, TablesInsert } from "@/lib/db/database.types";
import { formatRefTag, nextLineRefNumber } from "@/lib/ingredients/ref-tags";

export type AudioLineWithAsset = AudioLine & {
  assets: { id: string; bucket: string; storage_path: string; media_type: string } | null;
};

export async function listAudioLinesByEpisode(episodeId: string): Promise<AudioLineWithAsset[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("audio_lines")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type)")
    .eq("episode_id", episodeId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AudioLineWithAsset[];
}

export async function getAudioLine(id: string): Promise<AudioLineWithAsset | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("audio_lines")
    .select("*, assets:asset_id(id, bucket, storage_path, media_type)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AudioLineWithAsset | null;
}

async function allocateLineRefTag(episodeId: string): Promise<string> {
  const lines = await listAudioLinesByEpisode(episodeId);
  const next = nextLineRefNumber(lines.map((l) => l.ref_tag));
  return formatRefTag("line", next);
}

export async function createAudioLine(input: {
  episodeId: string;
  title: string;
  description?: string;
  assetId?: string | null;
}): Promise<AudioLine> {
  const supabase = await getDbClient();
  const refTag = await allocateLineRefTag(input.episodeId);
  const { count } = await supabase
    .from("audio_lines")
    .select("id", { count: "exact", head: true })
    .eq("episode_id", input.episodeId);

  const payload: TablesInsert<"audio_lines"> = {
    episode_id: input.episodeId,
    title: input.title,
    description: input.description ?? null,
    asset_id: input.assetId ?? null,
    ref_tag: refTag,
    sort_order: count ?? 0,
  };

  const { data, error } = await supabase.from("audio_lines").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAudioLine(id: string): Promise<string | null> {
  const line = await getAudioLine(id);
  if (!line) throw new Error("Audio line not found.");

  const assetId = line.asset_id;
  const supabase = await getDbClient();
  const { error } = await supabase.from("audio_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);

  return assetId;
}

export async function verifyEpisodeOwnership(episodeId: string): Promise<void> {
  const supabase = await getDbClient();
  const ownerId = await getActiveUserId();
  const { data, error } = await supabase
    .from("episodes")
    .select("id, series!inner(id, projects!inner(owner_id))")
    .eq("id", episodeId)
    .eq("series.projects.owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Episode not found");
}
