import "server-only";

import { isSeedanceConfigured } from "@/lib/ai/registry";
import { listAudioLinesByEpisode } from "@/lib/db/audio-lines";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { getEpisode, listEpisodesBySeries } from "@/lib/db/episodes";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { listScenesBySeries } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import { listTakesForScenes } from "@/lib/db/takes";
import { buildMentionSheets, buildProductionLibraryData } from "@/lib/production/library-data";
import { buildDisplayReferences } from "@/lib/production/enrich-scene-references";
import { resolveAssetUrl, resolveAssetUrls } from "@/lib/storage/resolve-urls";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

function logLoadWarning(label: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[episode-studio] ${label}`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

async function safe<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logLoadWarning(label, error, context);
    return fallback;
  }
}

export type EpisodeStudioTakeCard = {
  id: string;
  take_number: number;
  media_type: "image" | "video";
  starred: boolean;
  status: string;
  error_message: string | null;
  assetUrl: string | null;
  model: string | null;
  has_audio: boolean;
};

export async function loadEpisodeStudioPageData(input: {
  seriesId: string;
  episodeId: string;
}) {
  const { seriesId, episodeId } = input;

  const [series, episode, episodes, scenes, ingredients, audioLinesRaw, chatSession, sheetsRaw] =
    await Promise.all([
      getSeries(seriesId),
      getEpisode(episodeId),
      listEpisodesBySeries(seriesId),
      safe("listScenesBySeries", () => listScenesBySeries(seriesId), [] as SceneWithBindings[], {
        seriesId,
      }),
      safe("listIngredientsBySeries", () => listIngredientsBySeries(seriesId), [], { seriesId }),
      safe("listAudioLinesByEpisode", () => listAudioLinesByEpisode(episodeId), [], { episodeId }),
      safe(
        "getOrCreateChatSession",
        () => getOrCreateChatSession("episode", episodeId),
        { id: "" },
        { episodeId },
      ),
      safe("listCharacterSheetsBySeries", () => listCharacterSheetsBySeries(seriesId), [], {
        seriesId,
      }),
    ]);

  const ingredientsWithUrls = await safe(
    "resolveIngredientUrls",
    () =>
      resolveAssetUrls(
        ingredients.map((ingredient) => ({
          ...ingredient,
          assets: ingredient.assets,
        })),
      ),
    ingredients.map((ingredient) => ({ ...ingredient, assetUrl: null as string | null })),
    { seriesId },
  );

  const { costumesByCharacter, sheetsByCharacter } = await safe(
    "buildProductionLibraryData",
    () => buildProductionLibraryData({ ingredients: ingredientsWithUrls, sheets: sheetsRaw }),
    { costumesByCharacter: {}, sheetsByCharacter: {} },
    { seriesId },
  );

  const libraryIngredients = ingredientsWithUrls.map((item) => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description,
    ref_tag: item.ref_tag,
    assetUrl: item.assetUrl,
    mediaType: item.assets?.media_type ?? null,
    characterId: item.character_id,
    generationStatus: item.generation_status,
    generationError: item.generation_error,
  }));

  const takes = await safe(
    "listTakesForScenes",
    () => listTakesForScenes(scenes.map((s) => s.id)),
    [],
    { seriesId, episodeId },
  );

  const chatMessages = chatSession.id
    ? await safe("listChatMessages", () => listChatMessages(chatSession.id), [], {
        sessionId: chatSession.id,
      })
    : [];

  const audioLines = await safe("resolveAudioLineUrls", () => resolveAssetUrls(audioLinesRaw), [], {
    episodeId,
  });

  const mentionIngredients = ingredients.map((i) => ({
    id: i.id,
    ref_tag: i.ref_tag,
    name: i.name,
    kind: i.kind,
    character_id: i.character_id,
    generation_status: i.generation_status,
  }));

  const sheets = buildMentionSheets(sheetsRaw);
  const characterSheets = sheetsRaw.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    character_id: sheet.character_id,
    character_name: sheet.character?.name ?? "Character",
    costume_name: sheet.costume?.name ?? null,
    status: sheet.status,
    episode_ids: sheet.episode_ids,
  }));

  const takesByScene: Record<string, typeof takes> = {};
  for (const take of takes) {
    if (!takesByScene[take.scene_id]) takesByScene[take.scene_id] = [];
    takesByScene[take.scene_id].push(take);
  }

  const takesEnriched: Record<string, EpisodeStudioTakeCard[]> = {};
  for (const [sceneId, sceneTakes] of Object.entries(takesByScene)) {
    takesEnriched[sceneId] = [];
    for (const take of sceneTakes) {
      try {
        takesEnriched[sceneId].push({
          id: take.id,
          take_number: take.take_number,
          media_type: take.media_type,
          starred: take.starred,
          status: take.status,
          error_message: take.error_message,
          assetUrl: await resolveAssetUrl(take.assets),
          model: take.model,
          has_audio: take.has_audio ?? false,
        });
      } catch (error) {
        logLoadWarning("enrichTake", error, { takeId: take.id, sceneId });
        takesEnriched[sceneId].push({
          id: take.id,
          take_number: take.take_number,
          media_type: take.media_type,
          starred: take.starred,
          status: take.status,
          error_message: take.error_message,
          assetUrl: null,
          model: take.model,
          has_audio: take.has_audio ?? false,
        });
      }
    }
  }

  const ingredientsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const scenesWithDisplayRefs = await Promise.all(
    scenes.map(async (scene) => {
      try {
        return {
          ...scene,
          displayReferences: await buildDisplayReferences(scene, ingredientsById),
        };
      } catch (error) {
        logLoadWarning("buildDisplayReferences", error, { sceneId: scene.id });
        return { ...scene, displayReferences: [] };
      }
    }),
  );

  return {
    series,
    episode,
    episodes,
    scenes: scenesWithDisplayRefs,
    mentionIngredients,
    sheets,
    characterSheets,
    seedanceConfigured: isSeedanceConfigured(),
    takesEnriched,
    chatMessages,
    audioLines,
    libraryIngredients,
    costumesByCharacter,
    sheetsByCharacter,
    episodeSceneCount: scenes.filter((scene) => scene.episode_id === episodeId).length,
  };
}
