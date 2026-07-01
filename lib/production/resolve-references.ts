import "server-only";

import {
  findSheetForEpisodeCharacter,
  getCharacterSheet,
  listCharacterSheetsByCharacter,
  pickBestReadySheet,
} from "@/lib/db/character-sheets";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { getScene, updateScene } from "@/lib/db/scenes";
import { listSceneSheets, bindSheetToScene } from "@/lib/db/scene-sheets";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";
import { getSignedUrl } from "@/lib/storage/signed-url";
import type { VideoReferenceImage } from "@/lib/ai/video/types";
import {
  isIngredientReadyForBinding,
  isSheetReadyForBinding,
} from "@/lib/production/reference-readiness";
import { pickBestReadyIngredient } from "@/lib/production/pick-ready-ingredient";
import { resolveEffectiveBindingsForScene } from "@/lib/production/effective-bindings";

import type { ResolvedReference } from "@/lib/production/types";

export type { ResolvedReference } from "@/lib/production/types";

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

function extractSheetMentionLabels(prompt: string): string[] {
  const labels: string[] = [];
  const pattern = /@sheet:([^\s@]+)/gi;
  for (const match of prompt.matchAll(pattern)) {
    const label = match[1]?.trim();
    if (label) labels.push(label);
  }
  return labels;
}

export async function resolveSceneReferences(input: {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  autoBind?: boolean;
}): Promise<ResolvedReference[]> {
  const scene = await getScene(input.sceneId);
  if (!scene) throw new Error("Scene not found.");

  const ingredients = await listIngredientsBySeries(input.seriesId);
  const prompt = scene.prompt ?? scene.title;
  const resolved: ResolvedReference[] = [];
  const sheetMentionLabels = extractSheetMentionLabels(prompt);

  const characterNames = extractCharacterNames(prompt, ingredients);
  for (const name of characterNames) {
    const matches = ingredients.filter((i) => i.kind === "character" && i.name === name);
    const character = pickBestReadyIngredient(matches);
    if (!character) continue;

    const mentionLabel = sheetMentionLabels[0];
    const characterSheets = await listCharacterSheetsByCharacter(character.id);
    const { sheet: explicitSheet, ambiguous } = mentionLabel
      ? pickBestReadySheet(characterSheets, { episodeId: input.episodeId, label: mentionLabel })
      : { sheet: null, ambiguous: false };

    if (ambiguous) {
      console.warn(
        `[resolve-references] Multiple ready sheets match label "${mentionLabel}" for ${name}; using newest.`,
      );
    }

    const sheet =
      explicitSheet ??
      (await findSheetForEpisodeCharacter({
        episodeId: input.episodeId,
        characterId: character.id,
        label: mentionLabel,
      }));

    if (sheet && isSheetReadyForBinding(sheet)) {
      const assetUrls: string[] = [];
      const priorityAngles = ["front", "left_profile", "right_profile", "three_quarter"];
      for (const angleLabel of priorityAngles) {
        const angle = sheet.angles.find((a) => a.angle_label === angleLabel);
        if (angle?.assets) {
          const url = await getSignedUrl(angle.assets.bucket, angle.assets.storage_path);
          if (url) assetUrls.push(url);
        }
      }

      const label = sheet.costume
        ? `${character.name} · ${sheet.costume.name} sheet`
        : `${character.name} sheet`;

      resolved.push({
        type: "character_sheet",
        id: sheet.id,
        label,
        ref_tag: character.ref_tag,
        assetUrls,
      });

      if (input.autoBind) {
        await bindSheetToScene(input.sceneId, sheet.id, "identity_lock");
      }
    } else if (character.assets && isIngredientReadyForBinding(character)) {
      const url = await getSignedUrl(character.assets.bucket, character.assets.storage_path);
      resolved.push({
        type: "ingredient",
        id: character.id,
        label: `${character.name} (headshot — no sheet)`,
        ref_tag: character.ref_tag,
        assetUrls: url ? [url] : [],
      });
      if (input.autoBind && character.id) {
        await bindIngredientToScene(input.sceneId, character.id, "identity_lock");
      }
    }
  }

  for (const locName of extractLocationNames(prompt, ingredients)) {
    const matches = ingredients.filter((i) => i.kind === "location" && i.name === locName);
    const location = pickBestReadyIngredient(matches);
    if (!location?.assets || !isIngredientReadyForBinding(location)) continue;
    const url = await getSignedUrl(location.assets.bucket, location.assets.storage_path);
    resolved.push({
      type: "location",
      id: location.id,
      label: location.name,
      ref_tag: location.ref_tag,
      assetUrls: url ? [url] : [],
    });
    if (input.autoBind) {
      await bindIngredientToScene(input.sceneId, location.id, "reference");
    }
  }

  for (const voice of ingredients.filter((i) => i.kind === "voice")) {
    if (!prompt.toLowerCase().includes(voice.name.toLowerCase())) continue;
    const voiceStatus = voice.generation_status ?? "ready";
    if (voiceStatus === "failed" || voiceStatus === "pending") continue;
    resolved.push({
      type: "voice",
      id: voice.id,
      label: voice.name,
      ref_tag: voice.ref_tag,
      assetUrls: [],
    });
  }

  await updateScene(input.sceneId, {
    resolved_references: resolved as unknown as import("@/lib/db/database.types").Json,
  });

  if (input.autoBind) {
    await resolveEffectiveBindingsForScene({
      sceneId: input.sceneId,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      repair: true,
    });
  }

  return resolved;
}

export async function collectGenerationRefUrls(sceneId: string): Promise<string[]> {
  const boundSheets = await listSceneSheets(sceneId);
  const urls: string[] = [];

  for (const binding of boundSheets) {
    const sheet = binding.character_sheets as {
      angles?: Array<{ angle_label: string; assets?: { bucket: string; storage_path: string } | null }>;
    } | null;
    if (!sheet?.angles) continue;

    for (const angleLabel of ["front", "left_profile", "right_profile"]) {
      const angle = sheet.angles.find((a) => a.angle_label === angleLabel);
      if (angle?.assets) {
        const url = await getSignedUrl(angle.assets.bucket, angle.assets.storage_path);
        if (url) urls.push(url);
      }
    }
  }

  if (urls.length) return urls;

  const scene = await getScene(sceneId);
  if (!scene) return [];

  for (const binding of scene.scene_ingredients ?? []) {
    if (binding.role !== "identity_lock") continue;
    const ing = binding.ingredients;
    const asset = (binding as { ingredients?: { assets?: { bucket: string; storage_path: string } } })
      .ingredients;
    void ing;
    const a = asset as { assets?: { bucket: string; storage_path: string } } | undefined;
    if (a?.assets) {
      const url = await getSignedUrl(a.assets.bucket, a.assets.storage_path);
      if (url) urls.push(url);
    }
  }

  const refs = (scene.resolved_references ?? []) as ResolvedReference[];
  for (const ref of refs) {
    if (ref.type === "location") urls.push(...ref.assetUrls);
  }

  return [...new Set(urls)];
}

const SEEDANCE_SHEET_ANGLE_PRIORITY = ["front", "three_quarter", "left_profile", "right_profile"] as const;

function pickSheetAngleAsset(
  angles: Array<{ angle_label: string; assets?: { bucket: string; storage_path: string } | null }>,
) {
  for (const label of SEEDANCE_SHEET_ANGLE_PRIORITY) {
    const match = angles.find((angle) => angle.angle_label === label && angle.assets);
    if (match?.assets) return match.assets;
  }
  return angles.find((angle) => angle.assets)?.assets ?? null;
}

/** One image per bound character sheet + location for Seedance reference-to-video (max 9). */
export async function collectBoundVideoReferenceAssets(sceneId: string): Promise<VideoReferenceImage[]> {
  const scene = await getScene(sceneId);
  if (!scene) return [];

  const effective = await resolveEffectiveBindingsForScene({
    sceneId,
    episodeId: scene.episode_id,
    repair: true,
  });

  const refs: VideoReferenceImage[] = [];
  const sheetCharacterIds = new Set<string>();

  for (const { sheet } of effective.sheets) {
    const asset = pickSheetAngleAsset(sheet.angles ?? []);
    if (!asset) continue;

    const characterName = sheet.character?.name ?? sheet.name ?? "Character";
    const label = sheet.costume?.name
      ? `${characterName} · ${sheet.costume.name} sheet`
      : `${characterName} sheet`;

    const signedUrl = await getSignedUrl(asset.bucket, asset.storage_path);
    refs.push({
      label,
      bucket: asset.bucket,
      storagePath: asset.storage_path,
      signedUrl,
    });
    if (sheet.character_id) sheetCharacterIds.add(sheet.character_id);
  }

  for (const { ingredient, role } of effective.ingredients) {
    if (!ingredient.assets) continue;

    if (ingredient.kind === "location" && role === "reference") {
      const signedUrl = await getSignedUrl(ingredient.assets.bucket, ingredient.assets.storage_path);
      refs.push({
        label: ingredient.name,
        bucket: ingredient.assets.bucket,
        storagePath: ingredient.assets.storage_path,
        signedUrl,
      });
      continue;
    }

    if (
      ingredient.kind === "character" &&
      role === "identity_lock" &&
      !sheetCharacterIds.has(ingredient.id)
    ) {
      const signedUrl = await getSignedUrl(ingredient.assets.bucket, ingredient.assets.storage_path);
      refs.push({
        label: `${ingredient.name} (headshot)`,
        bucket: ingredient.assets.bucket,
        storagePath: ingredient.assets.storage_path,
        signedUrl,
      });
    }
  }

  return refs.slice(0, 9);
}

export async function getSheetRefUrls(sheetId: string): Promise<string[]> {
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet) return [];
  const urls: string[] = [];
  for (const angleLabel of ["front", "left_profile", "right_profile", "three_quarter"]) {
    const angle = sheet.angles.find((a) => a.angle_label === angleLabel);
    if (angle?.assets) {
      const url = await getSignedUrl(angle.assets.bucket, angle.assets.storage_path);
      if (url) urls.push(url);
    }
  }
  return urls;
}
