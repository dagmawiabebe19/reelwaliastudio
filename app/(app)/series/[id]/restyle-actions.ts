"use server";

import { revalidatePath } from "next/cache";
import { formatActionError } from "@/lib/credits/action-result";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { getSeries, updateSeries } from "@/lib/db/series";
import { generateTakesAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import {
  approveFalSafeRestyleSheets,
  cancelFalSafeRestyle,
  confirmDraftTestAndContinueCascade,
  getRestyleCascade,
  listDraftTestSegmentsForCharacter,
  startFalSafeBatchRestyle,
  startFalSafeRestyleHeadshot,
  syncFalSafeRestyleHeadshotPhase,
  updateRestyleCascade,
} from "@/lib/production/fal-safe-restyle";
import {
  DEFAULT_REFERENCE_STYLE,
  getFalSafeRestyleMeta,
  normalizeReferenceStyle,
} from "@/lib/production/reference-style";
import { getIngredient, listIngredientsBySeries } from "@/lib/db/ingredients";
import { listCharacterSheetsByCharacter } from "@/lib/db/character-sheets";

export async function updateSeriesReferenceStyleAction(
  seriesId: string,
  referenceStyle: string,
) {
  try {
    await verifySeriesOwnership(seriesId);
    const value = referenceStyle.trim() || DEFAULT_REFERENCE_STYLE;
    await updateSeries(seriesId, { reference_style: value });
    revalidatePath(`/series/${seriesId}`);
    return { referenceStyle: value };
  } catch (error) {
    return formatActionError(error, "Failed to save reference style.");
  }
}

export async function startFalSafeRestyleAction(seriesId: string, characterId: string) {
  try {
    const result = await startFalSafeRestyleHeadshot({ seriesId, characterId });
    revalidatePath(`/series/${seriesId}`);
    return result;
  } catch (error) {
    return formatActionError(error, "Failed to start fal-safe restyle.");
  }
}

export async function syncFalSafeRestylePhaseAction(seriesId: string, characterId: string) {
  try {
    const result = await syncFalSafeRestyleHeadshotPhase(seriesId, characterId);
    const character = await getIngredient(characterId);
    const meta = getFalSafeRestyleMeta(character?.metadata);
    const sheets = await listCharacterSheetsByCharacter(characterId);
    const sheetsPending = sheets.some((s) => s.status === "pending");
    const sheetsReady =
      sheets.length > 0 && sheets.every((s) => s.status === "ready" || s.status === "failed");

    if (meta?.phase === "sheets_pending" && sheetsReady && !sheetsPending) {
      const character = await getIngredient(characterId);
      const existing = getFalSafeRestyleMeta(character?.metadata);
      const { updateIngredient } = await import("@/lib/db/ingredients");
      const { withFalSafeRestyleMeta } = await import("@/lib/production/reference-style");
      await updateIngredient(characterId, {
        metadata: withFalSafeRestyleMeta(character?.metadata, {
          phase: "ready_for_draft_test",
          startedAt: existing?.startedAt,
          headshotReadyAt: existing?.headshotReadyAt,
          sheetsReadyAt: new Date().toISOString(),
        }) as import("@/lib/db/database.types").Json,
      });
      const cascade = await getRestyleCascade(seriesId);
      if (
        cascade?.currentCharacterId === characterId &&
        (cascade.status === "restyling_sheets" ||
          cascade.status === "restyling_headshot" ||
          cascade.status === "awaiting_sheet_approval")
      ) {
        await updateRestyleCascade(seriesId, {
          ...cascade,
          status: "awaiting_draft_test",
          updatedAt: new Date().toISOString(),
        });
      }
      revalidatePath(`/series/${seriesId}`);
      return { phase: "ready_for_draft_test" as const };
    }

    if (result.phase === "awaiting_sheet_approval") {
      const cascade = await getRestyleCascade(seriesId);
      if (cascade?.currentCharacterId === characterId && cascade.status === "restyling_headshot") {
        await updateRestyleCascade(seriesId, {
          ...cascade,
          status: "awaiting_sheet_approval",
          updatedAt: new Date().toISOString(),
        });
      }
      revalidatePath(`/series/${seriesId}`);
    }

    return result;
  } catch (error) {
    return formatActionError(error, "Failed to sync restyle phase.");
  }
}

export async function approveFalSafeRestyleSheetsAction(
  seriesId: string,
  characterId: string,
) {
  try {
    const result = await approveFalSafeRestyleSheets({ seriesId, characterId });
    const cascade = await getRestyleCascade(seriesId);
    if (cascade?.currentCharacterId === characterId) {
      await updateRestyleCascade(seriesId, {
        ...cascade,
        status: "restyling_sheets",
        updatedAt: new Date().toISOString(),
      });
    }
    revalidatePath(`/series/${seriesId}`);
    return result;
  } catch (error) {
    return formatActionError(error, "Failed to regenerate character sheets.");
  }
}

export async function cancelFalSafeRestyleAction(seriesId: string, characterId: string) {
  try {
    await cancelFalSafeRestyle(seriesId, characterId);
    revalidatePath(`/series/${seriesId}`);
    return { cancelled: true };
  } catch (error) {
    return formatActionError(error, "Failed to cancel restyle.");
  }
}

export async function listDraftTestSegmentsAction(seriesId: string, characterId: string) {
  try {
    const segments = await listDraftTestSegmentsForCharacter(seriesId, characterId);
    return { segments };
  } catch (error) {
    return formatActionError(error, "Failed to load draft test segments.");
  }
}

export async function runFalSafeDraftTestAction(input: {
  seriesId: string;
  characterId: string;
  sceneId: string;
  episodeId: string;
}) {
  try {
    await verifySeriesOwnership(input.seriesId);
    const result = await generateTakesAction({
      sceneId: input.sceneId,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      quality: "draft",
      takeCount: 1,
    });
    if ("error" in result && result.error) {
      return result;
    }

    const takeIds = "takeIds" in result && Array.isArray(result.takeIds) ? result.takeIds : [];

    const cascade = await getRestyleCascade(input.seriesId);
    if (cascade?.currentCharacterId === input.characterId) {
      await updateRestyleCascade(input.seriesId, {
        ...cascade,
        status: "awaiting_draft_test",
        draftTestSceneId: input.sceneId,
        draftTestEpisodeId: input.episodeId,
        lastDraftTakeId: takeIds[0] ?? null,
        updatedAt: new Date().toISOString(),
      });
    }

    revalidatePath(`/series/${input.seriesId}`);
    revalidatePath(`/series/${input.seriesId}/episodes/${input.episodeId}`);
    return {
      takeIds,
      studioPath: `/series/${input.seriesId}/episodes/${input.episodeId}`,
      note: "Draft take queued. Open the segment to confirm Seedance accepted the restyled refs, then confirm the draft test passed before continuing the cascade.",
    };
  } catch (error) {
    return formatActionError(error, "Failed to run draft test.");
  }
}

export async function confirmDraftTestPassedAction(seriesId: string) {
  try {
    const next = await confirmDraftTestAndContinueCascade(seriesId);
    revalidatePath(`/series/${seriesId}`);
    return { cascade: next };
  } catch (error) {
    return formatActionError(error, "Failed to continue restyle cascade.");
  }
}

export async function startFalSafeBatchRestyleAction(seriesId: string) {
  try {
    const cascade = await startFalSafeBatchRestyle(seriesId);
    revalidatePath(`/series/${seriesId}`);
    return {
      cascade,
      note: "Restyling the first character only. Approve the new headshot, regenerate sheets, run a draft test, then confirm it passed before the cascade continues.",
    };
  } catch (error) {
    return formatActionError(error, "Failed to start batch restyle.");
  }
}

export async function cancelFalSafeBatchRestyleAction(seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    await updateRestyleCascade(seriesId, null);
    revalidatePath(`/series/${seriesId}`);
    return { cancelled: true };
  } catch (error) {
    return formatActionError(error, "Failed to cancel batch restyle.");
  }
}

export async function getFalSafeRestyleStatusAction(seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const series = await getSeries(seriesId);
    const cascade = await getRestyleCascade(seriesId);
    const characters = (await listIngredientsBySeries(seriesId)).filter(
      (ing) => ing.kind === "character",
    );
    return {
      referenceStyle: normalizeReferenceStyle(series?.reference_style),
      cascade,
      characters: characters.map((c) => ({
        id: c.id,
        name: c.name,
        falSafeStyled: Boolean(c.fal_safe_styled),
        generationStatus: c.generation_status,
        restylePhase: getFalSafeRestyleMeta(c.metadata)?.phase ?? null,
      })),
    };
  } catch (error) {
    return formatActionError(error, "Failed to load restyle status.");
  }
}
