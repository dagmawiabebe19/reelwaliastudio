import "server-only";

import { resolveAmong } from "@/lib/ai/copilot/resolve-entity";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { listScenesByEpisode } from "@/lib/db/scenes";
import type { CopilotContext } from "@/lib/ai/copilot/tools";

export async function resolveSceneKey(
  key: string,
  context: CopilotContext,
): Promise<{ sceneId: string; scene_number: number; title: string } | { error: string; valid_options: string[] }> {
  const episodeId = context.episodeId;
  if (!episodeId) {
    return { error: "Open an episode before addressing scenes.", valid_options: [] };
  }
  const scenes = await listScenesByEpisode(episodeId);
  const resolved = resolveAmong(
    key,
    scenes,
    {
      id: (s) => s.id,
      ordinal: (s) => s.sort_order,
      title: (s) => s.title,
      label: (s) => `scene ${s.sort_order + 1}: ${s.title}`,
    },
    "scene",
  );
  if ("error" in resolved) return resolved;
  return {
    sceneId: resolved.entity.id,
    scene_number: resolved.entity.sort_order + 1,
    title: resolved.entity.title,
  };
}

export async function resolveIngredientKey(
  key: string,
  seriesId: string,
  kinds?: string[],
): Promise<{ id: string; ref_tag: string; name: string } | { error: string; valid_options: string[] }> {
  let ingredients = await listIngredientsBySeries(seriesId);
  if (kinds?.length) {
    ingredients = ingredients.filter((ing) => kinds.includes(ing.kind));
  }
  const resolved = resolveAmong(
    key,
    ingredients,
    {
      id: (i) => i.id,
      refTag: (i) => i.ref_tag,
      name: (i) => i.name,
      label: (i) => `${i.ref_tag} ${i.name}`,
    },
    "ingredient",
  );
  if ("error" in resolved) return resolved;
  return {
    id: resolved.entity.id,
    ref_tag: resolved.entity.ref_tag,
    name: resolved.entity.name,
  };
}

export async function resolveSheetKey(
  key: string,
  seriesId: string,
): Promise<
  | { id: string; name: string; character_name: string }
  | { error: string; valid_options: string[] }
> {
  const sheets = await listCharacterSheetsBySeries(seriesId);
  const resolved = resolveAmong(
    key,
    sheets,
    {
      id: (s) => s.id,
      name: (s) => s.name,
      title: (s) =>
        [s.character?.name, s.costume?.name, s.name].filter(Boolean).join(" · "),
      label: (s) =>
        `${s.character?.name ?? "?"}${s.costume?.name ? ` · ${s.costume.name}` : ""} — ${s.name}`,
    },
    "character sheet",
  );
  if ("error" in resolved) return resolved;
  return {
    id: resolved.entity.id,
    name: resolved.entity.name,
    character_name: resolved.entity.character?.name ?? "?",
  };
}
