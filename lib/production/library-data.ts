import "server-only";

import type { CharacterSheetWithDetails } from "@/lib/db/character-sheets";
import type { IngredientWithAsset } from "@/lib/db/ingredients";
import { getSignedUrl } from "@/lib/storage/signed-url";
import type { CharacterSheetCardData, IngredientCardData, MentionSheet } from "@/lib/production/types";

export async function buildProductionLibraryData(input: {
  ingredients: Array<IngredientWithAsset & { assetUrl?: string | null }>;
  sheets: CharacterSheetWithDetails[];
}) {
  const costumesByCharacter: Record<string, IngredientCardData[]> = {};
  for (const ing of input.ingredients) {
    if (ing.kind !== "outfit" || !ing.character_id) continue;
    const card: IngredientCardData = {
      id: ing.id,
      kind: ing.kind,
      name: ing.name,
      description: ing.description,
      ref_tag: ing.ref_tag,
      assetUrl: ing.assetUrl ?? null,
      mediaType: ing.assets?.media_type ?? null,
      characterId: ing.character_id,
      generationStatus: ing.generation_status,
      generationError: ing.generation_error,
    };
    if (!costumesByCharacter[ing.character_id]) costumesByCharacter[ing.character_id] = [];
    costumesByCharacter[ing.character_id].push(card);
  }

  const sheetsByCharacter: Record<string, CharacterSheetCardData[]> = {};
  for (const sheet of input.sheets) {
    const angleUrls: Record<string, string | null> = {};
    for (const angle of sheet.angles) {
      if (angle.assets) {
        angleUrls[angle.angle_label] = await getSignedUrl(
          angle.assets.bucket,
          angle.assets.storage_path,
        );
      } else {
        angleUrls[angle.angle_label] = null;
      }
    }

    const card: CharacterSheetCardData = {
      id: sheet.id,
      name: sheet.name,
      status: sheet.status,
      generation_error: sheet.generation_error,
      character_id: sheet.character_id,
      costume_id: sheet.costume_id,
      costume_name: sheet.costume?.name ?? null,
      episode_ids: sheet.episode_ids,
      angleUrls,
    };

    if (!sheetsByCharacter[sheet.character_id]) sheetsByCharacter[sheet.character_id] = [];
    sheetsByCharacter[sheet.character_id].push(card);
  }

  return { costumesByCharacter, sheetsByCharacter };
}

export function buildMentionSheets(sheets: CharacterSheetWithDetails[]): MentionSheet[] {
  const readySheets = sheets.filter((sheet) => sheet.status === "ready");
  const byLabel = new Map<string, CharacterSheetWithDetails>();

  for (const sheet of [...readySheets].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )) {
    const key = sheet.name.trim().toLowerCase();
    if (!byLabel.has(key)) {
      byLabel.set(key, sheet);
    }
  }

  return [...byLabel.values()].map((sheet) => ({
    id: sheet.id,
    label: sheet.name,
    character_id: sheet.character_id,
    character_name: sheet.character?.name ?? "Character",
    costume_name: sheet.costume?.name ?? null,
    status: sheet.status,
  }));
}

export async function buildCopilotCharacterSheets(sheets: CharacterSheetWithDetails[]) {
  return sheets.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    character_id: sheet.character_id,
    character_name: sheet.character?.name ?? "Character",
    costume_name: sheet.costume?.name ?? null,
    status: sheet.status,
    episode_ids: sheet.episode_ids,
  }));
}
