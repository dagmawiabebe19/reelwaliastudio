import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { Orientation, Scene, SceneStatus, TablesInsert } from "@/lib/db/database.types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

export { STORYBOARD_ONLY_LABEL } from "@/lib/storyboard/constants";
export type { SceneWithBindings } from "@/lib/storyboard/constants";

const SCENE_SELECT = `*, scene_ingredients(ingredient_id, role, ingredients(id, ref_tag, name, kind, primary_asset_id, generation_status, assets:primary_asset_id(id, bucket, storage_path, media_type))),
       scene_character_sheets(character_sheet_id, role,
         character_sheets(id, name, character_id, costume_id, status,
           character:character_id(id, name, ref_tag),
           costume:costume_id(id, name, ref_tag),
           angles:character_sheet_angles(angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type))))`;

export async function listScenesByEpisode(episodeId: string): Promise<SceneWithBindings[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scenes")
    .select(SCENE_SELECT)
    .eq("episode_id", episodeId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SceneWithBindings[];
}

export async function listScenesBySeries(seriesId: string): Promise<SceneWithBindings[]> {
  const supabase = await getDbClient();
  const { data: episodes, error: episodeError } = await supabase
    .from("episodes")
    .select("id")
    .eq("series_id", seriesId);

  if (episodeError) throw new Error(episodeError.message);

  const episodeIds = (episodes ?? []).map((episode) => episode.id);
  if (!episodeIds.length) return [];

  const { data, error } = await supabase
    .from("scenes")
    .select(SCENE_SELECT)
    .in("episode_id", episodeIds)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SceneWithBindings[];
}

export async function getScene(id: string): Promise<SceneWithBindings | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scenes")
    .select(SCENE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as SceneWithBindings | null;
}

export async function getSceneCount(episodeId: string): Promise<number> {
  const supabase = await getDbClient();
  const { count, error } = await supabase
    .from("scenes")
    .select("id", { count: "exact", head: true })
    .eq("episode_id", episodeId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function createScenesBatch(
  episodeId: string,
  inputs: Array<{
    title: string;
    actLabel?: string;
    prompt?: string | null;
    shotIntent?: string | null;
    audioMode?: string | null;
    generationTier?: string | null;
    durationSeconds?: number | null;
    orientation?: Orientation | null;
  }>,
): Promise<Scene[]> {
  if (!inputs.length) return [];

  const supabase = await getDbClient();
  const base = await getSceneCount(episodeId);

  const payloads: TablesInsert<"scenes">[] = inputs.map((input, index) => ({
    episode_id: episodeId,
    title: input.title,
    act_label: input.actLabel ?? "Storyboard-only",
    prompt: input.prompt ?? null,
    shot_intent: input.shotIntent ?? null,
    audio_mode: input.audioMode ?? null,
    generation_tier: input.generationTier ?? null,
    duration_seconds: input.durationSeconds ?? null,
    orientation: input.orientation ?? null,
    sort_order: base + index,
    position: base + index + 1,
  }));

  const { data, error } = await supabase.from("scenes").insert(payloads).select();
  if (error) {
    throw new Error(`Batch segment insert failed: ${error.message}`);
  }
  if (!data || data.length !== inputs.length) {
    throw new Error(
      `Batch segment insert incomplete: expected ${inputs.length} rows, got ${data?.length ?? 0}.`,
    );
  }
  return data;
}

export async function createScene(
  episodeId: string,
  input: { title: string; actLabel?: string },
): Promise<Scene> {
  const supabase = await getDbClient();
  const { count } = await supabase
    .from("scenes")
    .select("id", { count: "exact", head: true })
    .eq("episode_id", episodeId);

  const payload: TablesInsert<"scenes"> = {
    episode_id: episodeId,
    title: input.title,
    act_label: input.actLabel ?? "Storyboard-only",
    sort_order: count ?? 0,
    position: (count ?? 0) + 1,
  };

  const { data, error } = await supabase.from("scenes").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateScene(
  id: string,
  patch: Partial<
    Pick<
      Scene,
      | "title"
      | "prompt"
      | "shot_intent"
      | "audio_mode"
      | "generation_tier"
      | "orientation"
      | "duration_seconds"
      | "act_label"
      | "episode_id"
      | "status"
      | "resolved_references"
      | "reference_overrides"
    >
  >,
): Promise<Scene> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scenes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function reorderScenes(episodeId: string, orderedSceneIds: string[]): Promise<void> {
  const supabase = await getDbClient();
  for (let i = 0; i < orderedSceneIds.length; i++) {
    const { error } = await supabase
      .from("scenes")
      .update({ sort_order: i, position: i + 1 })
      .eq("id", orderedSceneIds[i])
      .eq("episode_id", episodeId);

    if (error) throw new Error(error.message);
  }
}

export async function archiveScene(id: string): Promise<Scene> {
  return updateScene(id, { status: "archived" as SceneStatus });
}

export async function unarchiveScene(id: string): Promise<Scene> {
  return updateScene(id, { status: "storyboard" as SceneStatus });
}

export function effectiveOrientation(
  sceneOrientation: Orientation | null,
  seriesDefault: Orientation,
): Orientation {
  return sceneOrientation ?? seriesDefault;
}
