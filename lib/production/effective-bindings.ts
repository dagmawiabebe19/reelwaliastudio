import "server-only";

import {
  listCharacterSheetsByCharacter,
  pickBestReadySheet,
  type CharacterSheetWithDetails,
} from "@/lib/db/character-sheets";
import { getEpisode } from "@/lib/db/episodes";
import { getIngredient, listIngredientsBySeries, type IngredientWithAsset } from "@/lib/db/ingredients";
import { getScene } from "@/lib/db/scenes";
import { bindIngredientToScene, unbindIngredientFromScene } from "@/lib/db/scene-ingredients";
import { bindSheetToScene, listSceneSheets, unbindSheetFromScene } from "@/lib/db/scene-sheets";
import { pickBestReadyIngredient } from "@/lib/production/pick-ready-ingredient";
import {
  ingredientAssetStatus,
  isIngredientReadyForBinding,
  isSheetReadyForBinding,
  sheetAssetStatus,
} from "@/lib/production/reference-readiness";

export type EffectiveSheetBinding = {
  sheet: CharacterSheetWithDetails;
  label: string;
  boundId: string;
  repaired: boolean;
};

export type EffectiveIngredientBinding = {
  ingredient: IngredientWithAsset;
  role: "identity_lock" | "reference";
  label: string;
  boundId: string;
  repaired: boolean;
};

export type EffectiveBindingsResult = {
  sheets: EffectiveSheetBinding[];
  ingredients: EffectiveIngredientBinding[];
  problems: string[];
};

function resolveBestLocation(
  bound: IngredientWithAsset,
  allIngredients: IngredientWithAsset[],
): IngredientWithAsset | null {
  const matches = allIngredients.filter(
    (item) => item.kind === "location" && item.name === bound.name,
  );
  return pickBestReadyIngredient(matches);
}

function resolveBestCharacterHeadshot(
  bound: IngredientWithAsset,
  allIngredients: IngredientWithAsset[],
): IngredientWithAsset | null {
  const matches = allIngredients.filter(
    (item) => item.kind === "character" && item.name === bound.name,
  );
  return pickBestReadyIngredient(matches);
}

async function resolveBestSheet(
  boundSheet: CharacterSheetWithDetails,
  episodeId: string,
): Promise<CharacterSheetWithDetails | null> {
  const sheets = await listCharacterSheetsByCharacter(boundSheet.character_id);
  const { sheet } = pickBestReadySheet(sheets, { episodeId });
  return sheet;
}

/**
 * Resolve bound scene references to the best READY assets (not literal stale IDs).
 * Optionally repairs scene_* binding tables to point at the ready versions.
 */
export async function resolveEffectiveBindingsForScene(input: {
  sceneId: string;
  seriesId?: string;
  episodeId?: string;
  repair?: boolean;
}): Promise<EffectiveBindingsResult> {
  const scene = await getScene(input.sceneId);
  if (!scene) {
    return { sheets: [], ingredients: [], problems: ["Scene not found."] };
  }

  const episodeId = input.episodeId ?? scene.episode_id;
  const episode = await getEpisode(episodeId);
  const seriesId = input.seriesId ?? episode?.series_id;
  if (!seriesId) {
    return { sheets: [], ingredients: [], problems: ["Episode / series not found."] };
  }

  const allIngredients = await listIngredientsBySeries(seriesId);
  const problems: string[] = [];
  const sheets: EffectiveSheetBinding[] = [];
  const ingredients: EffectiveIngredientBinding[] = [];

  const boundSheets = await listSceneSheets(input.sceneId);
  for (const binding of boundSheets) {
    const bound = binding.character_sheets as CharacterSheetWithDetails | null;
    if (!bound) continue;

    const label = bound.character?.name ?? bound.name;
    let effective = bound;
    let repaired = false;

    if (!isSheetReadyForBinding(bound)) {
      const best = await resolveBestSheet(bound, episodeId);
      if (best && isSheetReadyForBinding(best)) {
        effective = best;
        repaired = best.id !== bound.id;
        if (input.repair && repaired) {
          await unbindSheetFromScene(input.sceneId, bound.id);
          await bindSheetToScene(input.sceneId, best.id, binding.role as "identity_lock" | "reference");
        }
      } else {
        const status = sheetAssetStatus(bound);
        problems.push(
          `Character sheet "${label}" is ${status === "pending" ? "still generating" : status === "failed" ? "failed" : "missing usable angle images"} — cannot generate video.`,
        );
        continue;
      }
    }

    sheets.push({
      sheet: effective,
      label,
      boundId: bound.id,
      repaired,
    });
  }

  for (const binding of scene.scene_ingredients ?? []) {
    if (binding.role !== "identity_lock" && binding.role !== "reference") continue;

    const bound =
      (await getIngredient(binding.ingredient_id)) ??
      allIngredients.find((item) => item.id === binding.ingredient_id) ??
      null;

    if (!bound) {
      problems.push("A bound ingredient no longer exists.");
      continue;
    }

    let effective = bound;
    let repaired = false;

    if (!isIngredientReadyForBinding(bound)) {
      const best =
        bound.kind === "location"
          ? resolveBestLocation(bound, allIngredients)
          : bound.kind === "character"
            ? resolveBestCharacterHeadshot(bound, allIngredients)
            : pickBestReadyIngredient([bound]);

      if (best && isIngredientReadyForBinding(best)) {
        effective = best;
        repaired = best.id !== bound.id;
        if (input.repair && repaired) {
          await unbindIngredientFromScene(input.sceneId, bound.id);
          await bindIngredientToScene(
            input.sceneId,
            best.id,
            binding.role as "identity_lock" | "reference",
          );
        }
      } else {
        const status = ingredientAssetStatus(bound);
        problems.push(
          `"${bound.name}" is ${status === "pending" ? "still generating" : status === "failed" ? "failed" : "missing an asset"} — cannot generate video.`,
        );
        continue;
      }
    }

    ingredients.push({
      ingredient: effective,
      role: binding.role as "identity_lock" | "reference",
      label: effective.name,
      boundId: bound.id,
      repaired,
    });
  }

  return { sheets, ingredients, problems };
}
