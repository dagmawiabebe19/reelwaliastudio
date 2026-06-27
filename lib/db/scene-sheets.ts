import "server-only";

import { getDbClient } from "@/lib/db/client";

export async function bindSheetToScene(
  sceneId: string,
  characterSheetId: string,
  role: "identity_lock" | "reference" = "identity_lock",
): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase.from("scene_character_sheets").upsert(
    { scene_id: sceneId, character_sheet_id: characterSheetId, role },
    { onConflict: "scene_id,character_sheet_id" },
  );
  if (error) throw new Error(error.message);
}

export async function unbindSheetFromScene(sceneId: string, characterSheetId: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("scene_character_sheets")
    .delete()
    .eq("scene_id", sceneId)
    .eq("character_sheet_id", characterSheetId);
  if (error) throw new Error(error.message);
}

export async function listSceneSheets(sceneId: string) {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("scene_character_sheets")
    .select(
      `*, character_sheets(id, name, character_id, costume_id, status,
        character:character_id(id, name, ref_tag),
        costume:costume_id(id, name, ref_tag),
        angles:character_sheet_angles(angle_label, asset_id, assets:asset_id(bucket, storage_path, media_type)))`,
    )
    .eq("scene_id", sceneId);

  if (error) throw new Error(error.message);
  return data ?? [];
}
