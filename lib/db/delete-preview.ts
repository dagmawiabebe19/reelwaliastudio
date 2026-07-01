import "server-only";

import { getAudioLine } from "@/lib/db/audio-lines";
import {
  getCharacterSheet,
  listCharacterSheetsByCharacter,
  listCharacterSheetsByCostume,
} from "@/lib/db/character-sheets";
import { getIngredient, listCostumesByCharacter } from "@/lib/db/ingredients";
import { getScene } from "@/lib/db/scenes";
import { getTake, listTakesByScene, listTakesForScenes } from "@/lib/db/takes";

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
  const takeCount = takes.length;

  if (takeCount > 0) {
    const readyCount = takes.filter((take) => take.status === "ready").length;
    const starredCount = takes.filter((take) => take.starred).length;
    const detail =
      readyCount > 0 || starredCount > 0
        ? ` (${readyCount} ready${starredCount > 0 ? `, ${starredCount} starred` : ""})`
        : "";

    return {
      title: `Delete segment "${scene.title}"?`,
      message: `This segment has ${takeCount} take${takeCount === 1 ? "" : "s"}${detail}. Deleting removes them permanently. This cannot be undone.`,
    };
  }

  return {
    title: `Delete segment "${scene.title}"?`,
    message: "This permanently removes the segment. This cannot be undone.",
  };
}

function formatEpisodeCode(sortOrder: number): string {
  return `EP_${String(sortOrder + 1).padStart(2, "0")}`;
}

export async function getEpisodeDeletePreview(episodeId: string): Promise<DeletePreview> {
  const { getEpisode } = await import("@/lib/db/episodes");
  const { listScenesByEpisode } = await import("@/lib/db/scenes");
  const { listAudioLinesByEpisode } = await import("@/lib/db/audio-lines");

  const episode = await getEpisode(episodeId);
  if (!episode) throw new Error("Episode not found.");

  const scenes = await listScenesByEpisode(episodeId);
  const sceneCount = scenes.length;
  const takes = await listTakesForScenes(scenes.map((scene) => scene.id));
  const takeCount = takes.length;
  const audioLines = await listAudioLinesByEpisode(episodeId);
  const audioCount = audioLines.length;

  const epCode = formatEpisodeCode(episode.sort_order);
  const parts: string[] = [];

  if (sceneCount > 0) {
    parts.push(plural(sceneCount, "scene"));
  }
  if (takeCount > 0) {
    parts.push(`${plural(takeCount, "take")} (generated video)`);
  }
  if (audioCount > 0) {
    parts.push(plural(audioCount, "audio line"));
  }

  const cascade =
    parts.length > 0
      ? `This permanently removes ${parts.join(" and ")} and cannot be undone.`
      : "This permanently removes the episode and cannot be undone.";

  return {
    title: `Delete ${epCode}: ${episode.title}?`,
    message: `${cascade} Series ingredients, character sheets, and locations are not deleted.`,
  };
}
