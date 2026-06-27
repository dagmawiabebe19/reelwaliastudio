import "server-only";

import { after } from "next/server";
import { runOpenAiImage } from "@/lib/ai/image/openai-image";
import { defaultAspectRatioForIngredients, sheetAnglePrompt, type SheetAngle } from "@/lib/production/prompts";
import { createAsset } from "@/lib/db/assets";
import {
  addSheetAngle,
  getCharacterSheet,
  updateCharacterSheetStatus,
} from "@/lib/db/character-sheets";
import { getIngredientRefUrl } from "@/lib/ai/generation/ingredient-generation";

const SHEET_ANGLES: SheetAngle[] = [
  "front",
  "left_profile",
  "right_profile",
  "three_quarter",
  "back",
];

export async function executeSheetGeneration(sheetId: string): Promise<void> {
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet) throw new Error("Character sheet not found.");

  const characterName = sheet.character?.name ?? "Character";
  const costumeNote = sheet.costume
    ? `Wearing costume: ${sheet.costume.name}.`
    : "Base wardrobe from character reference.";

  const refUrls: string[] = [];
  const headshotUrl = await getIngredientRefUrl(sheet.character_id);
  if (headshotUrl) refUrls.push(headshotUrl);
  if (sheet.costume_id) {
    const costumeUrl = await getIngredientRefUrl(sheet.costume_id);
    if (costumeUrl) refUrls.push(costumeUrl);
  }

  if (!refUrls.length) {
    await updateCharacterSheetStatus(sheetId, "failed", "Character headshot is required before generating a sheet.");
    return;
  }

  try {
    for (const angle of SHEET_ANGLES) {
      const prompt = sheetAnglePrompt(angle, characterName, costumeNote);
      const result = await runOpenAiImage({
        prompt,
        refImageUrls: refUrls,
        aspectRatio: defaultAspectRatioForIngredients(),
        count: 1,
        resolution: "720p",
        safety: "sfw",
        sceneId: sheetId,
      });

      if (result.error || !result.persistedAssets?.[0]) {
        throw new Error(result.error ?? `Failed to generate ${angle} angle.`);
      }

      const persisted = result.persistedAssets[0];
      const asset = await createAsset({
        bucket: persisted.bucket,
        storagePath: persisted.storagePath,
        mediaType: persisted.mediaType,
        width: persisted.width ?? null,
        height: persisted.height ?? null,
        source: "generated",
        model: "openai-image",
        prompt,
      });

      await addSheetAngle({ sheetId, assetId: asset.id, angleLabel: angle });
    }

    await updateCharacterSheetStatus(sheetId, "ready", null);
  } catch (error) {
    await updateCharacterSheetStatus(
      sheetId,
      "failed",
      error instanceof Error ? error.message : "Sheet generation failed.",
    );
  }
}

export async function queueSheetGeneration(sheetId: string, revalidatePath?: string): Promise<void> {
  await updateCharacterSheetStatus(sheetId, "pending", null);

  after(async () => {
    await executeSheetGeneration(sheetId);
    if (revalidatePath) {
      const { revalidatePath: revalidate } = await import("next/cache");
      revalidate(revalidatePath);
    }
  });
}
