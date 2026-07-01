import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { Episode, EpisodeStatus, TablesInsert } from "@/lib/db/database.types";

export type EpisodeWithSceneCount = Episode & { scene_count: number };

export async function listEpisodesBySeries(
  seriesId: string,
  status?: EpisodeStatus,
): Promise<EpisodeWithSceneCount[]> {
  const supabase = await getDbClient();
  let query = supabase
    .from("episodes")
    .select("*, scenes(id)")
    .eq("series_id", seriesId)
    .order("sort_order", { ascending: true });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const scenes = row.scenes as { id: string }[] | null;
    const { scenes: _scenes, ...episode } = row;
    void _scenes;
    return {
      ...episode,
      scene_count: scenes?.length ?? 0,
    } as EpisodeWithSceneCount;
  });
}

export async function getEpisode(id: string): Promise<Episode | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase.from("episodes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createEpisode(seriesId: string, title: string, logline?: string): Promise<Episode> {
  const supabase = await getDbClient();
  const { count } = await supabase
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId);

  const payload: TablesInsert<"episodes"> = {
    series_id: seriesId,
    title,
    logline: logline ?? null,
    sort_order: count ?? 0,
  };

  const { data, error } = await supabase.from("episodes").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEpisodeStatus(id: string, status: EpisodeStatus): Promise<Episode> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("episodes")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export type PriorEpisodeSummary = {
  sort_order: number;
  title: string;
  summary_markdown: string;
};

/** Prior episodes in chronological order (most recent N when series is long). */
export async function listPriorEpisodeSummaries(
  seriesId: string,
  beforeSortOrder: number,
  limit = 10,
): Promise<PriorEpisodeSummary[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("episodes")
    .select("sort_order, title, summary_markdown")
    .eq("series_id", seriesId)
    .lt("sort_order", beforeSortOrder)
    .not("summary_markdown", "is", null)
    .order("sort_order", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row): row is PriorEpisodeSummary => Boolean(row.summary_markdown?.trim()))
    .reverse();
}

export async function updateEpisodeSummary(
  episodeId: string,
  summaryMarkdown: string,
): Promise<Episode> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("episodes")
    .update({ summary_markdown: summaryMarkdown.trim() || null })
    .eq("id", episodeId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
