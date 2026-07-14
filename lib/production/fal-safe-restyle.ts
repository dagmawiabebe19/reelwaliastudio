import "server-only";

import { getActiveUserId } from "@/lib/auth/getUser";
import { assertSufficientCredits } from "@/lib/credits/meter";
import { estimateImageCredits, estimateSheetCredits } from "@/lib/credits/pricing";
import {
  queueIngredientImageGeneration,
  retryIngredientImageGeneration,
} from "@/lib/ai/generation/ingredient-generation";
import {
  queueSheetGeneration,
  regenerateSheetInPlace,
} from "@/lib/ai/generation/sheet-generation";
import { listCharacterSheetsByCharacter } from "@/lib/db/character-sheets";
import { getIngredient, updateIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import { getSeries, updateSeries } from "@/lib/db/series";
import { getDbClient } from "@/lib/db/client";
import { buildCharacterHeadshotPrompt } from "@/lib/production/headshot-prompt";
import {
  getFalSafeRestyleMeta,
  normalizeReferenceStyle,
  parseRestyleCascade,
  withFalSafeRestyleMeta,
  type RestyleCascadeState,
} from "@/lib/production/reference-style";

export type DraftTestSegment = {
  sceneId: string;
  episodeId: string;
  sceneTitle: string;
  episodeTitle: string;
  sheetId: string;
  sheetName: string;
};

async function setCharacterRestyleMeta(
  characterId: string,
  metadata: unknown,
  phase: Parameters<typeof withFalSafeRestyleMeta>[1],
): Promise<void> {
  await updateIngredient(characterId, {
    metadata: withFalSafeRestyleMeta(metadata, phase) as import("@/lib/db/database.types").Json,
  });
}

export async function startFalSafeRestyleHeadshot(input: {
  seriesId: string;
  characterId: string;
  /** When true, regenerates synchronously (batch / approve path). */
  awaitCompletion?: boolean;
}): Promise<{ characterId: string; phase: string }> {
  await verifySeriesOwnership(input.seriesId);
  const character = await getIngredient(input.characterId);
  if (!character || character.kind !== "character" || character.series_id !== input.seriesId) {
    throw new Error("Character not found.");
  }
  if (character.generation_status === "pending") {
    throw new Error("Character headshot is already generating.");
  }
  const description = character.description?.trim();
  if (!description) {
    throw new Error("Character is missing a description.");
  }

  const series = await getSeries(input.seriesId);
  const referenceStyle = normalizeReferenceStyle(series?.reference_style);
  const userId = await getActiveUserId();
  await assertSufficientCredits(userId, estimateImageCredits(1));

  const now = new Date().toISOString();
  await setCharacterRestyleMeta(character.id, character.metadata, {
    phase: "headshot_pending",
    startedAt: now,
  });

  const prompt = buildCharacterHeadshotPrompt(description, { referenceStyle });
  const path = `/series/${input.seriesId}`;

  if (input.awaitCompletion) {
    const result = await retryIngredientImageGeneration(character.id, path, {
      markFalSafeStyled: true,
    });
    if (result.status === "failed") {
      throw new Error(result.error ?? "Headshot restyle failed.");
    }
    const refreshed = await getIngredient(character.id);
    await setCharacterRestyleMeta(character.id, refreshed?.metadata, {
      phase: "awaiting_sheet_approval",
      startedAt: now,
      headshotReadyAt: new Date().toISOString(),
    });
    return { characterId: character.id, phase: "awaiting_sheet_approval" };
  }

  await queueIngredientImageGeneration({
    ingredientId: character.id,
    prompt,
    revalidatePath: path,
    markFalSafeStyled: true,
  });

  // Background completion leaves phase as headshot_pending until client polls /
  // we advance on next approve call after ready.
  return { characterId: character.id, phase: "headshot_pending" };
}

/** Advance headshot_pending → awaiting_sheet_approval once generation is ready. */
export async function syncFalSafeRestyleHeadshotPhase(
  seriesId: string,
  characterId: string,
): Promise<{ phase: string | null }> {
  await verifySeriesOwnership(seriesId);
  const character = await getIngredient(characterId);
  if (!character || character.series_id !== seriesId) {
    throw new Error("Character not found.");
  }
  const meta = getFalSafeRestyleMeta(character.metadata);
  if (!meta || meta.phase !== "headshot_pending") {
    return { phase: meta?.phase ?? null };
  }
  if (character.generation_status === "ready" && character.primary_asset_id) {
    await setCharacterRestyleMeta(characterId, character.metadata, {
      ...meta,
      phase: "awaiting_sheet_approval",
      headshotReadyAt: new Date().toISOString(),
    });
    return { phase: "awaiting_sheet_approval" };
  }
  if (character.generation_status === "failed") {
    return { phase: "headshot_pending" };
  }
  return { phase: "headshot_pending" };
}

export async function approveFalSafeRestyleSheets(input: {
  seriesId: string;
  characterId: string;
  awaitCompletion?: boolean;
}): Promise<{ sheetIds: string[]; phase: string }> {
  await verifySeriesOwnership(input.seriesId);
  const character = await getIngredient(input.characterId);
  if (!character || character.kind !== "character" || character.series_id !== input.seriesId) {
    throw new Error("Character not found.");
  }
  if (character.generation_status !== "ready" || !character.primary_asset_id) {
    throw new Error("Approve the restyled headshot only after it finishes generating.");
  }

  const sheets = await listCharacterSheetsByCharacter(character.id);
  const targets = sheets.filter((sheet) => sheet.status !== "pending");
  if (!targets.length) {
    throw new Error("No character sheets to regenerate. Create a sheet first.");
  }

  const userId = await getActiveUserId();
  await assertSufficientCredits(userId, estimateSheetCredits() * targets.length);

  const now = new Date().toISOString();
  const meta = getFalSafeRestyleMeta(character.metadata);
  await setCharacterRestyleMeta(character.id, character.metadata, {
    phase: "sheets_pending",
    startedAt: meta?.startedAt ?? now,
    headshotReadyAt: meta?.headshotReadyAt ?? now,
  });

  const path = `/series/${input.seriesId}`;
  const sheetIds: string[] = [];

  if (input.awaitCompletion) {
    for (const sheet of targets) {
      const result = await regenerateSheetInPlace(sheet.id, path, {
        markFalSafeStyled: true,
      });
      if (result.status === "failed") {
        throw new Error(result.error ?? `Sheet ${sheet.name} restyle failed.`);
      }
      sheetIds.push(sheet.id);
    }
  } else {
    for (const sheet of targets) {
      sheetIds.push(sheet.id);
      await queueSheetGeneration(sheet.id, path, {
        forceAllAngles: true,
        markFalSafeStyled: true,
      });
    }
  }

  await setCharacterRestyleMeta(character.id, (await getIngredient(character.id))?.metadata, {
    phase: input.awaitCompletion ? "ready_for_draft_test" : "sheets_pending",
    startedAt: meta?.startedAt ?? now,
    headshotReadyAt: meta?.headshotReadyAt ?? now,
    sheetsReadyAt: input.awaitCompletion ? new Date().toISOString() : undefined,
  });

  return {
    sheetIds,
    phase: input.awaitCompletion ? "ready_for_draft_test" : "sheets_pending",
  };
}

export async function cancelFalSafeRestyle(
  seriesId: string,
  characterId: string,
): Promise<void> {
  await verifySeriesOwnership(seriesId);
  const character = await getIngredient(characterId);
  if (!character || character.series_id !== seriesId) {
    throw new Error("Character not found.");
  }
  await setCharacterRestyleMeta(characterId, character.metadata, null);
}

export async function markFalSafeRestyleComplete(
  seriesId: string,
  characterId: string,
): Promise<void> {
  await verifySeriesOwnership(seriesId);
  const character = await getIngredient(characterId);
  if (!character || character.series_id !== seriesId) {
    throw new Error("Character not found.");
  }
  const meta = getFalSafeRestyleMeta(character.metadata);
  await setCharacterRestyleMeta(characterId, character.metadata, {
    phase: "complete",
    startedAt: meta?.startedAt,
    headshotReadyAt: meta?.headshotReadyAt,
    sheetsReadyAt: meta?.sheetsReadyAt ?? new Date().toISOString(),
  });
}

export async function listDraftTestSegmentsForCharacter(
  seriesId: string,
  characterId: string,
): Promise<DraftTestSegment[]> {
  await verifySeriesOwnership(seriesId);
  const sheets = await listCharacterSheetsByCharacter(characterId);
  const readySheetIds = sheets
    .filter((sheet) => sheet.status === "ready" && sheet.angles.length > 0)
    .map((sheet) => sheet.id);
  if (!readySheetIds.length) return [];

  const supabase = await getDbClient();
  const { data: bindings, error } = await supabase
    .from("scene_character_sheets")
    .select("scene_id, character_sheet_id")
    .in("character_sheet_id", readySheetIds);

  if (error) throw new Error(error.message);
  if (!bindings?.length) return [];

  const sceneIds = [...new Set(bindings.map((b) => b.scene_id))];
  const { data: scenes, error: scenesError } = await supabase
    .from("scenes")
    .select("id, title, episode_id, episodes!inner(id, title, series_id)")
    .in("id", sceneIds);

  if (scenesError) throw new Error(scenesError.message);

  const sceneById = new Map(
    (scenes ?? []).map((scene) => {
      const episode = scene.episodes as unknown as {
        id: string;
        title: string;
        series_id: string;
      };
      return [scene.id, { ...scene, episode }];
    }),
  );

  const segments: DraftTestSegment[] = [];
  for (const binding of bindings) {
    const scene = sceneById.get(binding.scene_id);
    if (!scene || scene.episode.series_id !== seriesId) continue;
    const sheet = sheets.find((s) => s.id === binding.character_sheet_id);
    if (!sheet) continue;
    segments.push({
      sceneId: scene.id,
      episodeId: scene.episode.id,
      sceneTitle: scene.title,
      episodeTitle: scene.episode.title,
      sheetId: sheet.id,
      sheetName: sheet.name,
    });
  }
  return segments;
}

export async function startFalSafeBatchRestyle(
  seriesId: string,
): Promise<RestyleCascadeState> {
  await verifySeriesOwnership(seriesId);
  const { listIngredientsBySeries } = await import("@/lib/db/ingredients");
  const characters = (await listIngredientsBySeries(seriesId)).filter(
    (ing) => ing.kind === "character",
  );
  if (!characters.length) {
    throw new Error("No characters to restyle.");
  }

  const characterIds = characters.map((c) => c.id);
  const firstId = characterIds[0];
  const cascade: RestyleCascadeState = {
    status: "restyling_headshot",
    characterIds,
    index: 0,
    currentCharacterId: firstId,
    updatedAt: new Date().toISOString(),
  };
  await updateSeries(seriesId, {
    restyle_cascade: cascade as unknown as import("@/lib/db/database.types").Json,
  });

  await startFalSafeRestyleHeadshot({
    seriesId,
    characterId: firstId,
    awaitCompletion: false,
  });

  return {
    ...cascade,
    status: "restyling_headshot",
  };
}

export async function updateRestyleCascade(
  seriesId: string,
  cascade: RestyleCascadeState | null,
): Promise<void> {
  await updateSeries(seriesId, {
    restyle_cascade: (cascade ?? null) as unknown as import("@/lib/db/database.types").Json,
  });
}

export async function getRestyleCascade(seriesId: string): Promise<RestyleCascadeState | null> {
  const series = await getSeries(seriesId);
  return parseRestyleCascade(series?.restyle_cascade);
}

/**
 * After first character's draft test passes, continue cascade to next character
 * or mark complete. Never auto-restyles remaining characters without confirmation.
 */
export async function confirmDraftTestAndContinueCascade(
  seriesId: string,
): Promise<RestyleCascadeState> {
  await verifySeriesOwnership(seriesId);
  const cascade = await getRestyleCascade(seriesId);
  if (!cascade || cascade.status !== "awaiting_draft_test") {
    throw new Error("No batch restyle is waiting for a draft test confirmation.");
  }

  if (cascade.currentCharacterId) {
    await markFalSafeRestyleComplete(seriesId, cascade.currentCharacterId);
  }

  const nextIndex = cascade.index + 1;
  if (nextIndex >= cascade.characterIds.length) {
    const done: RestyleCascadeState = {
      ...cascade,
      status: "complete",
      index: nextIndex,
      currentCharacterId: null,
      updatedAt: new Date().toISOString(),
    };
    await updateRestyleCascade(seriesId, done);
    return done;
  }

  const nextId = cascade.characterIds[nextIndex];
  const next: RestyleCascadeState = {
    ...cascade,
    status: "restyling_headshot",
    index: nextIndex,
    currentCharacterId: nextId,
    draftTestSceneId: null,
    draftTestEpisodeId: null,
    lastDraftTakeId: null,
    updatedAt: new Date().toISOString(),
  };
  await updateRestyleCascade(seriesId, next);
  await startFalSafeRestyleHeadshot({
    seriesId,
    characterId: nextId,
    awaitCompletion: false,
  });
  return next;
}
