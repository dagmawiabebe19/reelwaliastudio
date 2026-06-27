import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { Orientation, Scene, SceneStatus, TablesInsert } from "@/lib/db/database.types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

export { ACT_GROUPS } from "@/lib/storyboard/constants";
export type { SceneWithBindings } from "@/lib/storyboard/constants";

export async function listScenesByEpisode(episodeId: string): Promise<SceneWithBindings[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scenes")
    .select(
      `*, scene_ingredients(ingredient_id, role, ingredients(id, ref_tag, name, kind)),
       scene_character_sheets(character_sheet_id, role,
         character_sheets(id, name, character_id, costume_id, status,
           character:character_id(id, name, ref_tag),
           costume:costume_id(id, name, ref_tag),
           angles:character_sheet_angles(angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type))))`,
    )
    .eq("episode_id", episodeId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as SceneWithBindings[];
}

export async function getScene(id: string): Promise<SceneWithBindings | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scenes")
    .select(
      `*, scene_ingredients(ingredient_id, role, ingredients(id, ref_tag, name, kind)),
       scene_character_sheets(character_sheet_id, role,
         character_sheets(id, name, character_id, costume_id, status,
           character:character_id(id, name, ref_tag),
           costume:costume_id(id, name, ref_tag),
           angles:character_sheet_angles(angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type))))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as SceneWithBindings | null;
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
      | "orientation"
      | "duration_seconds"
      | "act_label"
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
  return updateScene(id, { status: "active" as SceneStatus });
}

export function effectiveOrientation(
  sceneOrientation: Orientation | null,
  seriesDefault: Orientation,
): Orientation {
  return sceneOrientation ?? seriesDefault;
}
