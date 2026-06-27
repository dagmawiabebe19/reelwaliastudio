import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { EpisodeExport, TablesInsert } from "@/lib/db/database.types";

export async function createEpisodeExport(episodeId: string): Promise<EpisodeExport> {
  const supabase = await getDbClient();
  const payload: TablesInsert<"episode_exports"> = {
    episode_id: episodeId,
    status: "pending",
  };

  const { data, error } = await supabase.from("episode_exports").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEpisodeExport(
  id: string,
  patch: Partial<Pick<EpisodeExport, "status" | "asset_id" | "error_message">>,
): Promise<EpisodeExport> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("episode_exports")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getLatestEpisodeExport(episodeId: string): Promise<EpisodeExport | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("episode_exports")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
