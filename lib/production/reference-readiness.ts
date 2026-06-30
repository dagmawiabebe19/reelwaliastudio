import "server-only";

import { getCharacterSheet, findSheetForEpisodeCharacter, listCharacterSheetsByCharacter } from "@/lib/db/character-sheets";
import type { IngredientWithAsset } from "@/lib/db/ingredients";
import { getIngredient, listIngredientsBySeries } from "@/lib/db/ingredients";
import { getScene } from "@/lib/db/scenes";
import { listSceneSheets } from "@/lib/db/scene-sheets";

export type ReferenceAssetStatus = "ready" | "pending" | "failed" | "missing";

export function ingredientAssetStatus(ingredient: {
  generation_status?: string | null;
  primary_asset_id?: string | null;
  assets?: { bucket: string; storage_path: string } | null;
}): ReferenceAssetStatus {
  const status = ingredient.generation_status ?? "ready";
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  if (!ingredient.primary_asset_id && !ingredient.assets) return "missing";
  return "ready";
}

export function sheetAssetStatus(sheet: {
  status?: string | null;
  angles?: Array<{ assets?: { bucket: string; storage_path: string } | null }>;
}): ReferenceAssetStatus {
  const status = sheet.status ?? "draft";
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  const hasAngle = (sheet.angles ?? []).some((angle) => angle.assets);
  if (!hasAngle) return "missing";
  return "ready";
}

export function isIngredientReadyForBinding(ingredient: {
  generation_status?: string | null;
  primary_asset_id?: string | null;
  assets?: { bucket: string; storage_path: string } | null;
}): boolean {
  return ingredientAssetStatus(ingredient) === "ready";
}

export function isSheetReadyForBinding(sheet: {
  status?: string | null;
  angles?: Array<{ assets?: { bucket: string; storage_path: string } | null }>;
}): boolean {
  return sheetAssetStatus(sheet) === "ready";
}

function extractCharacterNames(prompt: string, ingredients: { name: string; kind: string }[]): string[] {
  const names: string[] = [];
  for (const ing of ingredients.filter((i) => i.kind === "character")) {
    if (prompt.toLowerCase().includes(ing.name.toLowerCase())) {
      names.push(ing.name);
    }
  }
  return names;
}

function extractLocationNames(prompt: string, ingredients: { name: string; kind: string }[]): string[] {
  const names: string[] = [];
  for (const ing of ingredients.filter((i) => i.kind === "location")) {
    if (prompt.toLowerCase().includes(ing.name.toLowerCase())) {
      names.push(ing.name);
    }
  }
  return names;
}

export type SegmentLockAssessment = {
  scene_id: string;
  title: string;
  fully_locked: boolean;
  missing: string[];
  details: {
    sheets: string[];
    locations: string[];
    voices: string[];
    audio_mode: string | null;
    shot_intent: string | null;
    duration_seconds: number | null;
    generation_tier: string | null;
  };
};

export async function assessSegmentLock(input: {
  sceneId: string;
  seriesId: string;
  episodeId: string;
}): Promise<SegmentLockAssessment> {
  const scene = await getScene(input.sceneId);
  if (!scene) {
    return {
      scene_id: input.sceneId,
      title: "(unknown)",
      fully_locked: false,
      missing: ["Scene not found"],
      details: {
        sheets: [],
        locations: [],
        voices: [],
        audio_mode: null,
        shot_intent: null,
        duration_seconds: null,
        generation_tier: null,
      },
    };
  }

  const ingredients = await listIngredientsBySeries(input.seriesId);
  const prompt = scene.prompt ?? scene.title;
  const missing: string[] = [];
  const sheets: string[] = [];
  const locations: string[] = [];
  const voices: string[] = [];

  for (const name of extractCharacterNames(prompt, ingredients)) {
    const character = ingredients.find((i) => i.kind === "character" && i.name === name);
    if (!character) {
      missing.push(`${name} character`);
      continue;
    }

    const sheet = await findSheetForEpisodeCharacter({
      episodeId: input.episodeId,
      characterId: character.id,
    });

    if (!sheet || !isSheetReadyForBinding(sheet)) {
      const sheetsForChar = await listCharacterSheetsByCharacter(character.id);
      const pending = sheetsForChar.find((s) => s.status === "pending");
      const failed = sheetsForChar.find((s) => s.status === "failed");
      if (pending) {
        missing.push(`${name} sheet (generating)`);
      } else if (failed) {
        missing.push(`${name} sheet (failed — regenerate)`);
      } else {
        missing.push(`${name} sheet (no ready sheet)`);
      }
      continue;
    }

    const label = sheet.costume
      ? `${character.name} · ${sheet.costume.name} sheet`
      : `${character.name} sheet`;
    sheets.push(label);
  }

  for (const locName of extractLocationNames(prompt, ingredients)) {
    const location = ingredients.find((i) => i.kind === "location" && i.name === locName);
    if (!location) {
      missing.push(`${locName} location`);
      continue;
    }
    const locStatus = ingredientAssetStatus(location);
    if (locStatus !== "ready") {
      missing.push(
        `${locName} location (${locStatus === "pending" ? "generating" : locStatus === "failed" ? "failed" : "no asset"})`,
      );
      continue;
    }
    locations.push(location.name);
  }

  for (const voice of ingredients.filter((i) => i.kind === "voice")) {
    if (prompt.toLowerCase().includes(voice.name.toLowerCase())) {
      voices.push(voice.name);
    }
  }

  const boundSheets = await listSceneSheets(input.sceneId);
  for (const binding of boundSheets) {
    const sheet = binding.character_sheets as {
      id: string;
      name: string;
      status?: string;
      character?: { name: string } | null;
      angles?: Array<{ assets?: { bucket: string; storage_path: string } | null }>;
    } | null;
    if (!sheet) continue;
    const status = sheetAssetStatus(sheet);
    const label = sheet.character?.name ?? sheet.name;
    if (status !== "ready") {
      missing.push(
        `Bound sheet ${label} (${status === "pending" ? "generating" : status === "failed" ? "failed" : "missing assets"})`,
      );
    } else if (!sheets.some((s) => s.includes(label))) {
      sheets.push(`${label} sheet (bound)`);
    }
  }

  const audioMode = (scene as { audio_mode?: string | null }).audio_mode ?? null;
  const generationTier = (scene as { generation_tier?: string | null }).generation_tier ?? null;

  return {
    scene_id: scene.id,
    title: scene.title,
    fully_locked: missing.length === 0 && (sheets.length > 0 || locations.length > 0),
    missing,
    details: {
      sheets,
      locations,
      voices,
      audio_mode: audioMode,
      shot_intent: scene.shot_intent,
      duration_seconds: scene.duration_seconds,
      generation_tier: generationTier,
    },
  };
}

export async function validateSceneReferencesForVideoGeneration(
  sceneId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scene = await getScene(sceneId);
  if (!scene) {
    return { ok: false, error: "Scene not found." };
  }

  const problems: string[] = [];

  const boundSheets = await listSceneSheets(sceneId);
  for (const binding of boundSheets) {
    const sheet = binding.character_sheets as {
      id: string;
      name: string;
      status?: string;
      character?: { name: string } | null;
      angles?: Array<{ assets?: { bucket: string; storage_path: string } | null }>;
    } | null;
    if (!sheet) continue;
    const status = sheetAssetStatus(sheet);
    const label = sheet.character?.name ?? sheet.name;
    if (status === "pending") {
      problems.push(`Character sheet "${label}" is still generating.`);
    } else if (status === "failed") {
      problems.push(`Character sheet "${label}" failed — regenerate before video.`);
    } else if (status === "missing") {
      problems.push(`Character sheet "${label}" has no usable angle images.`);
    }
  }

  for (const binding of scene.scene_ingredients ?? []) {
    const ingredient = binding.ingredients as IngredientWithAsset | null;
    if (!ingredient) {
      const loaded = await getIngredient(binding.ingredient_id);
      if (!loaded) {
        problems.push("A bound ingredient no longer exists.");
        continue;
      }
      const status = ingredientAssetStatus(loaded);
      if (status !== "ready") {
        problems.push(
          `"${loaded.name}" is ${status === "pending" ? "still generating" : status === "failed" ? "failed" : "missing an asset"} — cannot generate video.`,
        );
      }
      continue;
    }

    const status = ingredientAssetStatus(ingredient);
    if (status !== "ready" && (binding.role === "identity_lock" || binding.role === "reference")) {
      problems.push(
        `"${ingredient.name}" is ${status === "pending" ? "still generating" : status === "failed" ? "failed" : "missing an asset"} — cannot generate video.`,
      );
    }
  }

  if (problems.length) {
    return {
      ok: false,
      error: problems.join(" "),
    };
  }

  return { ok: true };
}

export async function assertSheetReadyForBinding(sheetId: string): Promise<string | null> {
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet) return "Character sheet not found.";
  const status = sheetAssetStatus(sheet);
  if (status === "pending") return `Sheet "${sheet.name}" is still generating.`;
  if (status === "failed") return `Sheet "${sheet.name}" failed — regenerate before binding.`;
  if (status === "missing") return `Sheet "${sheet.name}" has no ready angle images.`;
  return null;
}

export async function assertIngredientReadyForBinding(ingredientId: string): Promise<string | null> {
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient) return "Ingredient not found.";
  const status = ingredientAssetStatus(ingredient);
  if (status === "pending") return `"${ingredient.name}" is still generating.`;
  if (status === "failed") return `"${ingredient.name}" failed — regenerate before binding.`;
  if (status === "missing") return `"${ingredient.name}" has no asset yet.`;
  return null;
}
