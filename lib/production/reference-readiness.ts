import { resolveEffectiveBindingsForScene } from "@/lib/production/effective-bindings";
import { pickBestReadyIngredient } from "@/lib/production/pick-ready-ingredient";
import {
  findSheetForEpisodeCharacter,
  getCharacterSheet,
  listCharacterSheetsByCharacter,
} from "@/lib/db/character-sheets";
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
  const hasStorage =
    Boolean(ingredient.assets?.bucket && ingredient.assets?.storage_path) ||
    Boolean(ingredient.primary_asset_id);
  if (!hasStorage) return "missing";
  if (ingredient.primary_asset_id && !ingredient.assets?.bucket) return "missing";
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
    const matches = ingredients.filter((i) => i.kind === "character" && i.name === name);
    const character = pickBestReadyIngredient(matches);
    if (!character) {
      const any = matches[0];
      if (any) {
        const charStatus = ingredientAssetStatus(any);
        missing.push(
          `${name} character (${charStatus === "pending" ? "generating" : charStatus === "failed" ? "failed" : "no asset"})`,
        );
      } else {
        missing.push(`${name} character`);
      }
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
    const matches = ingredients.filter((i) => i.kind === "location" && i.name === locName);
    const location = pickBestReadyIngredient(matches);
    if (!location) {
      const any = matches[0];
      if (any) {
        const locStatus = ingredientAssetStatus(any);
        missing.push(
          `${locName} location (${locStatus === "pending" ? "generating" : locStatus === "failed" ? "failed" : "no asset"})`,
        );
      } else {
        missing.push(`${locName} location`);
      }
      continue;
    }
    locations.push(location.name);
  }

  for (const voice of ingredients.filter((i) => i.kind === "voice")) {
    if (!isIngredientReadyForBinding(voice)) continue;
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
  options?: { seriesId?: string; episodeId?: string; repair?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scene = await getScene(sceneId);
  if (!scene) {
    return { ok: false, error: "Scene not found." };
  }

  const { problems } = await resolveEffectiveBindingsForScene({
    sceneId,
    seriesId: options?.seriesId,
    episodeId: options?.episodeId ?? scene.episode_id,
    repair: options?.repair ?? false,
  });

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
