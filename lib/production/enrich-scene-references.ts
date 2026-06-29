import "server-only";

import type { IngredientWithAsset } from "@/lib/db/ingredients";
import { getSignedUrl } from "@/lib/storage/signed-url";
import type { ResolvedReference } from "@/lib/production/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

/** Fresh signed thumbnail URLs for bound sheets / ingredients (avoids stale JSONB URLs). */
export async function buildDisplayReferences(
  scene: SceneWithBindings,
  ingredientsById: Map<string, IngredientWithAsset>,
): Promise<ResolvedReference[]> {
  const refs: ResolvedReference[] = [];
  const seen = new Set<string>();

  for (const binding of scene.scene_character_sheets ?? []) {
    const sheet = binding.character_sheets;
    if (!sheet) continue;

    const key = `character_sheet-${sheet.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const front =
      sheet.angles?.find((angle) => angle.angle_label === "front") ?? sheet.angles?.[0];
    const thumbUrl = front?.assets
      ? await getSignedUrl(front.assets.bucket, front.assets.storage_path)
      : null;

    const label = sheet.costume
      ? `${sheet.character?.name ?? "Character"} · ${sheet.costume.name}`
      : (sheet.character?.name ?? sheet.name);

    refs.push({
      type: "character_sheet",
      id: sheet.id,
      label,
      ref_tag: sheet.character?.ref_tag,
      assetUrls: thumbUrl ? [thumbUrl] : [],
    });
  }

  for (const binding of scene.scene_ingredients ?? []) {
    const meta = binding.ingredients;
    if (!meta) continue;

    const ingredient = ingredientsById.get(meta.id);
    if (!ingredient) continue;

    const key = `${meta.kind}-${meta.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const thumbUrl = ingredient.assets
      ? await getSignedUrl(ingredient.assets.bucket, ingredient.assets.storage_path)
      : null;

    const type =
      ingredient.kind === "location"
        ? "location"
        : ingredient.kind === "voice"
          ? "voice"
          : "ingredient";

    refs.push({
      type,
      id: ingredient.id,
      label: ingredient.name,
      ref_tag: ingredient.ref_tag,
      assetUrls: thumbUrl ? [thumbUrl] : [],
    });
  }

  const stored = (scene.resolved_references ?? []) as ResolvedReference[];
  for (const ref of stored) {
    const key = `${ref.type}-${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (ref.type === "voice") {
      refs.push({ ...ref, assetUrls: [] });
    }
  }

  return refs;
}
