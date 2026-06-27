import "server-only";

import { getDbClient } from "@/lib/db/client";

export async function bindIngredientToScene(
  sceneId: string,
  ingredientId: string,
  role: "identity_lock" | "reference" = "identity_lock",
): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase.from("scene_ingredients").upsert(
    { scene_id: sceneId, ingredient_id: ingredientId, role },
    { onConflict: "scene_id,ingredient_id" },
  );

  if (error) throw new Error(error.message);
}

export async function unbindIngredientFromScene(
  sceneId: string,
  ingredientId: string,
): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("scene_ingredients")
    .delete()
    .eq("scene_id", sceneId)
    .eq("ingredient_id", ingredientId);

  if (error) throw new Error(error.message);
}
