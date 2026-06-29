import "server-only";

import { getAudioLine } from "@/lib/db/audio-lines";
import {
  getCharacterSheet,
  listCharacterSheetsByCharacter,
  listCharacterSheetsByCostume,
} from "@/lib/db/character-sheets";
import { getIngredient, listCostumesByCharacter } from "@/lib/db/ingredients";
import { getScene } from "@/lib/db/scenes";
import { getTake, listTakesByScene } from "@/lib/db/takes";

export type DeletePreview = {
  title: string;
  message: string;
};

function plural(count: number, singular: string, pluralForm?: string): string {
  if (count === 1) return `1 ${singular}`;
  return `${count} ${pluralForm ?? `${singular}s`}`;
}

export async function getIngredientDeletePreview(ingredientId: string): Promise<DeletePreview> {
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient) throw new Error("Ingredient not found.");

  const parts: string[] = [];

  if (ingredient.kind === "character") {
    const costumes = await listCostumesByCharacter(ingredientId);
    const sheets = await listCharacterSheetsByCharacter(ingredientId);
    if (costumes.length) parts.push(plural(costumes.length, "costume"));
    if (sheets.length) parts.push(plural(sheets.length, "character sheet"));
  } else if (ingredient.kind === "outfit") {
    const sheets = await listCharacterSheetsByCostume(ingredientId);
    if (sheets.length) parts.push(plural(sheets.length, "character sheet"));
  }

  const cascade =
    parts.length > 0
      ? ` This also removes ${parts.join(" and ")}.`
      : "";

  return {
    title: `Delete ${ingredient.name}?`,
    message: `This permanently deletes the ${ingredient.kind} and its stored media.${cascade}`,
  };
}

export async function getCharacterSheetDeletePreview(sheetId: string): Promise<DeletePreview> {
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet) throw new Error("Character sheet not found.");

  const characterName = sheet.character?.name ?? "character";
  const costumeNote = sheet.costume?.name ? ` (${sheet.costume.name})` : "";

  return {
    title: `Delete sheet "${sheet.name}"?`,
    message:
      `This permanently deletes the turnaround for ${characterName}${costumeNote}, ` +
      "including all angle images and any scene bindings to this sheet.",
  };
}

export async function getTakeDeletePreview(takeId: string): Promise<DeletePreview> {
  const take = await getTake(takeId);
  if (!take) throw new Error("Take not found.");

  return {
    title: `Delete take ${take.take_number}?`,
    message: "This permanently deletes the take and its generated media file.",
  };
}

export async function getAudioLineDeletePreview(lineId: string): Promise<DeletePreview> {
  const line = await getAudioLine(lineId);
  if (!line) throw new Error("Audio line not found.");

  return {
    title: `Delete "${line.title}"?`,
    message: "This permanently deletes the audio line and its file.",
  };
}

export async function getSceneDeletePreview(sceneId: string): Promise<DeletePreview> {
  const scene = await getScene(sceneId);
  if (!scene) throw new Error("Scene not found.");

  const takes = await listTakesByScene(sceneId);
  const readyTakes = takes.filter((take) => take.status === "ready");
  const starredTakes = takes.filter((take) => take.starred);

  const takeSummary =
    takes.length === 0
      ? "no takes"
      : `${takes.length} take${takes.length === 1 ? "" : "s"} (${readyTakes.length} ready${
          starredTakes.length ? `, ${starredTakes.length} starred` : ""
        })`;

  return {
    title: `Delete segment "${scene.title}"?`,
    message:
      `This permanently removes the segment and all of its takes — ${takeSummary}. ` +
      "Starred and ready takes are deleted with the segment. This cannot be undone.",
  };
}
