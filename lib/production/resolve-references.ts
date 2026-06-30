import "server-only";

import { getDbClient } from "@/lib/db/client";
import { findSheetForEpisodeCharacter, getCharacterSheet, listCharacterSheetsByCharacter, pickBestReadySheet } from "@/lib/db/character-sheets";
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
    const character = ingredients.find((i) => i.kind === "character" && i.name === name);
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
    const location = ingredients.find((i) => i.kind === "location" && i.name === locName);
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
  const refs: VideoReferenceImage[] = [];
  const sheetCharacterIds = new Set<string>();

  const bindings = await listSceneSheets(sceneId);
  for (const binding of bindings) {
    const sheet = binding.character_sheets as {
      id: string;
      name: string;
      status?: string;
      character_id: string;
      character?: { id: string; name: string } | null;
      costume?: { name: string } | null;
      angles?: Array<{ angle_label: string; assets?: { bucket: string; storage_path: string } | null }>;
    } | null;
    if (!sheet?.angles?.length || !isSheetReadyForBinding(sheet)) continue;

    const asset = pickSheetAngleAsset(sheet.angles);
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

  const scene = await getScene(sceneId);
  if (!scene) return refs.slice(0, 9);

  const ingredientBindings = (scene.scene_ingredients ?? []).filter(
    (binding) => binding.role === "reference" || binding.role === "identity_lock",
  );
  const ingredientIds = ingredientBindings.map((binding) => binding.ingredient_id);
  if (!ingredientIds.length) return refs.slice(0, 9);

  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, kind, primary_asset_id, generation_status, assets:primary_asset_id(bucket, storage_path)")
    .in("id", ingredientIds);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const binding = ingredientBindings.find((item) => item.ingredient_id === row.id);
    if (!binding) continue;

    const rawAsset = row.assets as { bucket: string; storage_path: string } | { bucket: string; storage_path: string }[] | null;
    const asset = Array.isArray(rawAsset) ? rawAsset[0] : rawAsset;
    if (!asset) continue;

    const ingredientRow = {
      generation_status: (row as { generation_status?: string }).generation_status,
      primary_asset_id: (row as { primary_asset_id?: string }).primary_asset_id,
      assets: asset,
    };
    if (!isIngredientReadyForBinding(ingredientRow)) continue;

    if (row.kind === "location" && binding.role === "reference") {
      const signedUrl = await getSignedUrl(asset.bucket, asset.storage_path);
      refs.push({
        label: row.name,
        bucket: asset.bucket,
        storagePath: asset.storage_path,
        signedUrl,
      });
      continue;
    }

    if (row.kind === "character" && binding.role === "identity_lock" && !sheetCharacterIds.has(row.id)) {
      const signedUrl = await getSignedUrl(asset.bucket, asset.storage_path);
      refs.push({
        label: `${row.name} (headshot)`,
        bucket: asset.bucket,
        storagePath: asset.storage_path,
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
