import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { getActiveUserId } from "@/lib/auth/getUser";
import { CopilotAbortError, isAbortError, throwIfAborted } from "@/lib/ai/copilot/abort";
import { streamAnthropicTurn } from "@/lib/ai/copilot/stream-turn";
import type { TurnBillingState } from "@/lib/ai/copilot/turn-billing";
import { TurnBillingState as TurnBillingTracker } from "@/lib/ai/copilot/turn-billing";
import { assertSufficientCredits } from "@/lib/credits/meter";
import { settleCopilotTurnReservation, resolveCopilotTurnCommitCredits } from "@/lib/credits/copilot-settle";
import { reserveCredits, releaseReservation } from "@/lib/credits/mutations";
import { getBalance } from "@/lib/credits/balance";
import { isAdmin } from "@/lib/auth/isAdmin";
import {
  isInsufficientCreditsError,
  insufficientCreditsFromMessage,
  InsufficientCreditsError,
  toInsufficientCreditsPayload,
} from "@/lib/credits/errors";
import {
  estimateCopilotTurnCredits,
  estimateImageCredits,
  estimateSheetCredits,
  formatCopilotUsageCostLog,
} from "@/lib/credits/pricing";
import {
  executeIngredientImageGeneration,
  getIngredientRefUrl,
} from "@/lib/ai/generation/ingredient-generation";
import {
  LOCATION_ESTABLISHING_PREFIX,
  costumePreviewPrompt,
} from "@/lib/production/prompts";
import { buildCharacterHeadshotPrompt } from "@/lib/production/headshot-prompt";
import { executeSheetGeneration } from "@/lib/ai/generation/sheet-generation";
import { executeDraftStoryboard, normalizeStoryboardSegments } from "@/lib/ai/copilot/draft-storyboard";
import {
  resolveIngredientKey,
  resolveSceneKey,
  resolveSheetKey,
} from "@/lib/ai/copilot/resolve-tool-entities";
import {
  generateAndStoreEpisodeSummary,
  PRIOR_EPISODE_SUMMARY_LIMIT,
  scheduleEpisodeSummaryRefresh,
} from "@/lib/ai/copilot/episode-summary";
import {
  groupCopilotToolsByWave,
  runCopilotToolWave,
  SETUP_GENERATION_CONCURRENCY,
  SETUP_WAVE_ORDER,
  splitGenerationSubWaves,
} from "@/lib/ai/copilot/tool-waves";
import { runWithConcurrencySettled } from "@/lib/ai/generation/concurrency";
import { createCharacterSheet } from "@/lib/db/character-sheets";
import type { CopilotOutputEvent } from "@/lib/copilot/output";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { assertIngredientReadyForBinding, assertSheetReadyForBinding } from "@/lib/production/reference-readiness";
import { createIngredient, getIngredient } from "@/lib/db/ingredients";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";
import { bindSheetToScene } from "@/lib/db/scene-sheets";
import { getScene } from "@/lib/db/scenes";
import { resolveCopilotModel } from "@/lib/ai/copilot/resolve-model";
import { formatToolDoneSummary, formatToolRunningLabel } from "@/lib/ai/copilot/progress";
import {
  buildCopilotSystemBlocks,
  COPILOT_TOOLS,
  type CopilotContext,
} from "@/lib/ai/copilot/tools";
import { appendChatMessage, listChatMessages } from "@/lib/db/chat";
import { appendSeriesMemoryMarkdown } from "@/lib/db/series-memory";
import { getScreenplayById, getScreenplayScenesInRange } from "@/lib/db/screenplays";
import { getEpisode, listPriorEpisodeSummaries } from "@/lib/db/episodes";
import { getSeries } from "@/lib/db/series";

const SCREENPLAY_SCENE_TOOL_MAX_RANGE = 5;

export type CopilotStreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; toolId: string; name: string; args: Record<string, unknown> }
  | {
      type: "tool_progress";
      toolId: string;
      name: string;
      message: string;
      step?: number;
      total?: number;
    }
  | { type: "tool_done"; toolId: string; name: string; result: Record<string, unknown>; summary: string }
  | { type: "copilot_output"; payload: CopilotOutputEvent }
  | { type: "turn_complete"; summary: string }
  | { type: "aborted"; message: string; inFlightNote?: string }
  | {
      type: "error";
      message: string;
      insufficientCredits?: { needed: number; available: number };
    }
  | { type: "done" };

type ToolProgressEmitter = (detail: string, step?: number, total?: number) => void;
type OutputEmitter = (event: CopilotOutputEvent) => void;

async function resolveDraftStoryboardEpisodeId(
  context: CopilotContext,
  args: Record<string, unknown>,
): Promise<{ episodeId: string } | { error: string }> {
  const requested = args.episode_id ? String(args.episode_id).trim() : "";
  const episodeId = context.episodeId?.trim() || requested;

  if (!episodeId) {
    return {
      error:
        "No active episode — open the episode studio for the episode you are planning, or pass episode_id explicitly.",
    };
  }

  const episode = await getEpisode(episodeId);
  if (!episode) {
    return { error: `Episode not found: ${episodeId}` };
  }
  if (episode.series_id !== context.seriesId) {
    return {
      error: `Episode ${episodeId} does not belong to series ${context.seriesId}.`,
    };
  }

  return { episodeId };
}

type ToolExecutionOptions = {
  abortSignal?: AbortSignal;
  billing?: TurnBillingState;
  userId?: string;
};

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: CopilotContext,
  emitProgress: ToolProgressEmitter,
  emitOutput: OutputEmitter,
  options?: ToolExecutionOptions,
): Promise<Record<string, unknown>> {
  throwIfAborted(options?.abortSignal);

  switch (name) {
    case "draft_storyboard": {
      const episodeResolution = await resolveDraftStoryboardEpisodeId(context, args);
      if ("error" in episodeResolution) {
        return { error: episodeResolution.error };
      }
      const episodeId = episodeResolution.episodeId;
      const episode = await getEpisode(episodeId);
      if (!episode) {
        return { error: `Episode not found: ${episodeId}` };
      }

      const segments = normalizeStoryboardSegments(args);
      if (!segments.length) {
        return {
          error:
            "No segments in draft_storyboard — pass a segments array with title and prompt for each shot. A text-only episode plan in chat does not create storyboard cards until you approve and call this tool.",
        };
      }

      try {
        const result = await executeDraftStoryboard({
          episode,
          episodeId,
          seriesId: context.seriesId,
          segments,
          emitProgress: (detail, step, total) => emitProgress(detail, step, total),
        });

        if (result.count < 1) {
          return {
            error: "draft_storyboard finished without creating or updating any segments.",
            ...result,
          };
        }

        revalidatePath(`/series/${context.seriesId}/episodes/${episodeId}`);
        if (options?.userId) {
          scheduleEpisodeSummaryRefresh({
            episodeId,
            userId: options.userId,
            force: true,
            turnNotes: [`draft_storyboard: ${result.count} segments`],
          });
        }
        return result;
      } catch (error) {
        if (error instanceof CopilotAbortError) {
          throw error;
        }
        return {
          error: error instanceof Error ? error.message : "draft_storyboard failed.",
        };
      }
    }

    case "add_ingredient": {
      const seriesId = context.seriesId || String(args.series_id);
      const kind = args.kind as Parameters<typeof createIngredient>[0]["kind"];
      const name = String(args.name ?? "").trim();
      const description = args.description ? String(args.description) : undefined;
      let characterId = args.character_id ? String(args.character_id) : undefined;
      const generate = args.generate === true;

      if (characterId) {
        const resolvedChar = await resolveIngredientKey(characterId, seriesId, ["character"]);
        if ("error" in resolvedChar) {
          return resolvedChar;
        }
        characterId = resolvedChar.id;
      }

      if (generate && !description) {
        return { error: "description is required when generate=true." };
      }
      if (kind === "outfit" && generate && !characterId) {
        return { error: "character_id is required to generate a costume preview." };
      }

      emitProgress("creating ingredient…", 1, generate ? 2 : 1);

      const ingredient = await createIngredient({
        seriesId,
        kind,
        name,
        description,
        characterId: characterId ?? null,
        generationStatus: generate ? "pending" : "ready",
      });

      emitOutput({
        type: "ingredient_created",
        toolId: "",
        ingredientId: ingredient.id,
        name: ingredient.name,
        ingredientKind: kind,
        refTag: ingredient.ref_tag,
        status: generate ? "pending" : "ready",
      });

      if (generate && description) {
        let prompt = description;
        let refImageUrls: string[] | undefined;

        try {
          const userId = await getActiveUserId();
          await assertSufficientCredits(userId, estimateImageCredits(1));
        } catch (error) {
          if (isInsufficientCreditsError(error)) {
            return {
              error: `Not enough credits (need ${error.needed}, have ${error.available}).`,
              insufficientCredits: toInsufficientCreditsPayload(error),
            };
          }
          throw error;
        }

        if (kind === "character") {
          prompt = buildCharacterHeadshotPrompt(description);
          emitProgress("generating headshot…", 2, 2);
        } else if (kind === "location") {
          prompt = `${LOCATION_ESTABLISHING_PREFIX}${description}`;
          emitProgress("generating establishing shot…", 2, 2);
        } else if (kind === "outfit" && characterId) {
          const character = await getIngredient(characterId);
          if (!character) return { error: "Character not found." };
          const headshotUrl = await getIngredientRefUrl(characterId);
          if (!headshotUrl) {
            return { error: "Generate the character headshot first.", ingredient_id: ingredient.id };
          }
          prompt = costumePreviewPrompt(character.name, description);
          refImageUrls = [headshotUrl];
          emitProgress("generating costume preview…", 2, 2);
        } else {
          return { ingredient_id: ingredient.id, ref_tag: ingredient.ref_tag, note: "Generate not supported for this kind." };
        }

        let genResult;
        try {
          genResult = await executeIngredientImageGeneration({
            ingredientId: ingredient.id,
            prompt,
            refImageUrls,
            onProgress: (msg, step, total) => emitProgress(msg, step, total),
            abortSignal: options?.abortSignal,
            onBillableWorkStarted: () =>
              options?.billing?.markPaidToolStarted("image", ingredient.id),
          });
        } catch (error) {
          if (error instanceof CopilotAbortError) {
            throw error;
          }
          if (isInsufficientCreditsError(error)) {
            return {
              error: `Not enough credits (need ${error.needed}, have ${error.available}).`,
              insufficientCredits: toInsufficientCreditsPayload(error),
              ingredient_id: ingredient.id,
            };
          }
          throw error;
        }

        emitOutput({
          type: "ingredient_updated",
          ingredientId: ingredient.id,
          status: genResult.status,
          generationError: genResult.error ?? null,
        });

        return {
          ingredient_id: ingredient.id,
          ref_tag: ingredient.ref_tag,
          generating: true,
          status: genResult.status,
          error: genResult.error,
        };
      }

      return { ingredient_id: ingredient.id, ref_tag: ingredient.ref_tag, generating: generate };
    }

    case "bind_identity": {
      const sceneKey =
        (typeof args.scene_number === "number" ? String(args.scene_number) : null) ||
        (args.scene_id ? String(args.scene_id) : null);
      if (!sceneKey) {
        return { error: "Pass scene_number or scene title/@ref — not an empty scene_id." };
      }
      const sceneResolved = await resolveSceneKey(sceneKey, context);
      if ("error" in sceneResolved) return sceneResolved;
      const sceneId = sceneResolved.sceneId;

      const sheetKeys = (args.character_sheet_ids as string[]) ?? [];
      const ingredientKeys = (args.ingredient_ids as string[]) ?? [];
      const sheetIds: string[] = [];
      const ingredientIds: string[] = [];
      const sheetRefs: string[] = [];
      const ingredientRefs: string[] = [];

      for (const key of sheetKeys) {
        const resolved = await resolveSheetKey(key, context.seriesId);
        if ("error" in resolved) return resolved;
        sheetIds.push(resolved.id);
        sheetRefs.push(`${resolved.character_name} — ${resolved.name}`);
      }
      for (const key of ingredientKeys) {
        const resolved = await resolveIngredientKey(key, context.seriesId);
        if ("error" in resolved) return resolved;
        ingredientIds.push(resolved.id);
        ingredientRefs.push(`${resolved.ref_tag} ${resolved.name}`);
      }

      const total = sheetIds.length + ingredientIds.length;

      for (const sheetId of sheetIds) {
        const block = await assertSheetReadyForBinding(sheetId);
        if (block) {
          return { error: block, sheet_ref: sheetRefs[sheetIds.indexOf(sheetId)], bound: false };
        }
      }
      for (const ingredientId of ingredientIds) {
        const block = await assertIngredientReadyForBinding(ingredientId);
        if (block) {
          return {
            error: block,
            ingredient_ref: ingredientRefs[ingredientIds.indexOf(ingredientId)],
            bound: false,
          };
        }
      }

      emitProgress("binding identity locks…", 0, total || 1);

      const bindTargets = [
        ...sheetIds.map((id) => ({ kind: "sheet" as const, id })),
        ...ingredientIds.map((id) => ({ kind: "ingredient" as const, id })),
      ];

      const bindOutcomes = await runWithConcurrencySettled(bindTargets, 6, async (target) => {
        if (target.kind === "sheet") {
          await bindSheetToScene(sceneId, target.id, "identity_lock");
        } else {
          await bindIngredientToScene(sceneId, target.id, "reference");
        }
      });

      const boundCount = bindOutcomes.filter((outcome) => outcome.status === "fulfilled").length;
      emitProgress(`bound ${boundCount}/${total || boundCount}…`, boundCount, total || boundCount);

      for (const outcome of bindOutcomes) {
        if (outcome.status === "rejected") {
          throw outcome.reason;
        }
      }

      const scene = await getScene(sceneId);
      const episodeId = context.episodeId ?? scene?.episode_id;
      if (episodeId) {
        emitProgress("refreshing resolved references…", total || 1, total || 1);
        await resolveSceneReferences({
          sceneId,
          seriesId: context.seriesId,
          episodeId,
          autoBind: false,
        });
      }

      return {
        scene: `scene ${sceneResolved.scene_number}: ${sceneResolved.title}`,
        bound_sheets: sheetRefs,
        bound_ingredients: ingredientRefs,
      };
    }

    case "create_character_sheet": {
      const seriesId = context.seriesId || String(args.series_id);
      const characterKey = String(args.character_id ?? "").trim();
      const name = String(args.name ?? "").trim();
      const costumeKey = args.costume_id ? String(args.costume_id) : null;
      const episodeIds = (args.episode_ids as string[]) ?? [];

      if (!name) return { error: "name is required." };
      if (!characterKey) return { error: "character_id (@ref_tag or name) is required." };

      const characterResolved = await resolveIngredientKey(characterKey, seriesId, ["character"]);
      if ("error" in characterResolved) return characterResolved;
      const characterId = characterResolved.id;

      let costumeId: string | null = null;
      let costumeName: string | null = null;
      if (costumeKey) {
        const costumeResolved = await resolveIngredientKey(costumeKey, seriesId, ["outfit"]);
        if ("error" in costumeResolved) return costumeResolved;
        costumeId = costumeResolved.id;
        costumeName = costumeResolved.name;
      }

      try {
        const userId = await getActiveUserId();
        await assertSufficientCredits(userId, estimateSheetCredits());
      } catch (error) {
        if (isInsufficientCreditsError(error)) {
          return {
            error: `Not enough credits (need ${error.needed}, have ${error.available}).`,
            insufficientCredits: toInsufficientCreditsPayload(error),
          };
        }
        throw error;
      }

      emitProgress("creating character sheet…", 0, 5);

      const character = await getIngredient(characterId);
      const costume = costumeId ? await getIngredient(costumeId) : null;

      const sheet = await createCharacterSheet({
        seriesId,
        characterId,
        costumeId,
        name,
        episodeIds,
      });

      emitOutput({
        type: "sheet_created",
        toolId: "",
        sheetId: sheet.id,
        name: sheet.name,
        characterName: character?.name ?? characterResolved.name,
        costumeName: costume?.name ?? costumeName,
        status: "pending",
      });

      let genResult;
      try {
        const safeEmitProgress: ToolProgressEmitter = (detail, step, total) => {
          try {
            emitProgress(detail, step, total);
          } catch (error) {
            console.warn("[copilot] tool progress dropped (stream closed)", {
              detail,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };

        genResult = await executeSheetGeneration(
          sheet.id,
          (msg, step, total) => {
            safeEmitProgress(msg, step, total);
            if (step && total) {
              emitOutput({ type: "sheet_progress", sheetId: sheet.id, step, total });
            }
          },
          {
            abortSignal: options?.abortSignal,
            onBillableWorkStarted: () =>
              options?.billing?.markPaidToolStarted("sheet", sheet.id),
          },
        );
      } catch (error) {
        if (error instanceof CopilotAbortError) {
          throw error;
        }
        if (isInsufficientCreditsError(error)) {
          return {
            error: `Not enough credits (need ${error.needed}, have ${error.available}).`,
            insufficientCredits: toInsufficientCreditsPayload(error),
            sheet: `${characterResolved.name} — ${name}`,
          };
        }
        throw error;
      }

      emitOutput({
        type: "sheet_updated",
        sheetId: sheet.id,
        status: genResult.status,
        generationError: genResult.error ?? null,
      });

      return {
        sheet: `${characterResolved.name}${costume?.name || costumeName ? ` · ${costume?.name ?? costumeName}` : ""} — ${name}`,
        character: `${characterResolved.ref_tag} ${characterResolved.name}`,
        status: genResult.status,
        error: genResult.error,
      };
    }

    case "update_episode_summary": {
      const episodeResolution = await resolveDraftStoryboardEpisodeId(context, args);
      if ("error" in episodeResolution) {
        return { error: episodeResolution.error };
      }
      const episodeId = episodeResolution.episodeId;
      if (!options?.userId) {
        return { error: "Not authenticated." };
      }

      const note = args.note ? String(args.note).trim() : "";
      emitProgress("refreshing episode summary…", 1, 1);

      try {
        const result = await generateAndStoreEpisodeSummary({
          episodeId,
          userId: options.userId,
          force: true,
          turnNotes: note ? [note] : undefined,
        });
        return {
          updated: result.updated,
          summary_markdown: result.summary_markdown,
          skipped: result.skipped,
        };
      } catch (error) {
        if (isInsufficientCreditsError(error)) {
          return {
            error: `Not enough credits (need ${error.needed}, have ${error.available}).`,
            insufficientCredits: toInsufficientCreditsPayload(error),
          };
        }
        return {
          error: error instanceof Error ? error.message : "update_episode_summary failed.",
        };
      }
    }

    case "update_series_memory": {
      const seriesId = String(args.series_id);
      const entry = String(args.entry ?? "").trim();
      const section = args.section === "world" ? "world" : "preferences";

      if (!entry) return { error: "entry is required." };
      if (seriesId !== context.seriesId) {
        return { error: "series_id does not match the active co-pilot session." };
      }

      emitProgress("updating series memory…", 1, 1);

      const next = await appendSeriesMemoryMarkdown(seriesId, entry, section);
      context.seriesMemoryMarkdown = next;

      return {
        updated: true,
        section,
        entry,
        memory_length: next.length,
      };
    }

    case "get_screenplay_scenes": {
      const screenplayId = String(args.screenplay_id ?? "").trim();
      const fromScene = Number(args.from_scene);
      const toScene = Number(args.to_scene);

      if (!screenplayId) return { error: "screenplay_id is required." };
      if (!Number.isInteger(fromScene) || !Number.isInteger(toScene)) {
        return { error: "from_scene and to_scene must be integers (sort_order)." };
      }
      if (toScene < fromScene) {
        return { error: "to_scene must be >= from_scene." };
      }
      if (toScene - fromScene + 1 > SCREENPLAY_SCENE_TOOL_MAX_RANGE) {
        return {
          error: `Maximum ${SCREENPLAY_SCENE_TOOL_MAX_RANGE} scenes per request.`,
        };
      }

      const screenplay = await getScreenplayById(screenplayId);
      if (!screenplay || screenplay.series_id !== context.seriesId) {
        return { error: "Screenplay not found for this series." };
      }
      if (context.screenplayId && context.screenplayId !== screenplayId) {
        return { error: "screenplay_id does not match the active series screenplay." };
      }

      emitProgress(`loading scenes ${fromScene}–${toScene}…`, 1, 1);
      const scenes = await getScreenplayScenesInRange({
        screenplayId,
        fromScene,
        toScene,
      });

      return {
        screenplay_id: screenplayId,
        from_scene: fromScene,
        to_scene: toScene,
        scenes: scenes.map((scene) => ({
          sort_order: scene.sort_order,
          scene_number: scene.scene_number,
          slugline: scene.slugline,
          synopsis: scene.synopsis,
          characters: scene.characters,
          location: scene.location,
          full_text: scene.full_text,
        })),
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function runCopilotStream(input: {
  sessionId: string;
  userMessage: string;
  context: CopilotContext;
  modelId?: string;
  scopeType?: "series" | "episode" | "scene";
  scopeId?: string;
  abortSignal?: AbortSignal;
  onEvent: (event: CopilotStreamEvent) => void;
}): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    input.onEvent({
      type: "error",
      message: "Co-pilot not configured — set ANTHROPIC_API_KEY to enable.",
    });
    input.onEvent({ type: "done" });
    return;
  }

  if (input.scopeType === "episode" && input.scopeId) {
    input.context.episodeId = input.context.episodeId ?? input.scopeId;
  }

  const freshSeries = await getSeries(input.context.seriesId);
  if (freshSeries) {
    input.context.seriesMemoryMarkdown = freshSeries.memory_markdown ?? "";
  }

  if (input.context.episodeId) {
    const activeEpisode = await getEpisode(input.context.episodeId);
    if (activeEpisode && activeEpisode.sort_order > 0) {
      input.context.priorEpisodeSummaries = await listPriorEpisodeSummaries(
        input.context.seriesId,
        activeEpisode.sort_order,
        PRIOR_EPISODE_SUMMARY_LIMIT,
      );
    } else {
      input.context.priorEpisodeSummaries = [];
    }
  }

  let userId: string;
  try {
    userId = await getActiveUserId();
  } catch {
    input.onEvent({ type: "error", message: "Not authenticated." });
    input.onEvent({ type: "done" });
    return;
  }

  const model = resolveCopilotModel(input.modelId);
  const turnEstimate = estimateCopilotTurnCredits(model);

  try {
    await assertSufficientCredits(userId, turnEstimate);
  } catch (error) {
    if (isInsufficientCreditsError(error)) {
      input.onEvent({
        type: "error",
        message: `Not enough credits. Need ${error.needed}, you have ${error.available}.`,
        insufficientCredits: toInsufficientCreditsPayload(error),
      });
      input.onEvent({ type: "done" });
      return;
    }
    throw error;
  }

  let reservationId: string | null = null;
  let turnSettled = false;
  const billing = new TurnBillingTracker();

  const settleTurn = async () => {
    if (!reservationId || turnSettled) return;
    const creditsCommitted = resolveCopilotTurnCommitCredits(model, turnEstimate, billing);
    try {
      const outcome = await settleCopilotTurnReservation(reservationId, model, billing);
      turnSettled = true;
      console.log(
        "[copilot-meter]",
        formatCopilotUsageCostLog({
          modelId: model,
          usage: billing.usage ?? {},
          creditsCommitted,
          turnLabel: `session:${input.sessionId}`,
        }),
        `settle=${outcome}`,
      );
    } catch (settleError) {
      console.error("[copilot-meter] settle failed — releasing reservation", {
        sessionId: input.sessionId,
        reservationId,
        error: settleError instanceof Error ? settleError.message : String(settleError),
      });
      if (!turnSettled) {
        try {
          await releaseReservation(reservationId);
          turnSettled = true;
        } catch (releaseError) {
          console.error("[copilot-meter] release after failed settle also failed", {
            reservationId,
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
          });
        }
      }
      throw settleError;
    }
  };

  try {
    try {
      reservationId = await reserveCredits(
        userId,
        turnEstimate,
        `copilot:session:${input.sessionId}`,
      );
    } catch (error) {
      const admin = await isAdmin(userId);
      if (admin) {
        throw error instanceof Error
          ? new Error(
              `Admin credit reserve failed unexpectedly (apply migration 013): ${error.message}`,
            )
          : error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message === "insufficient_credits") {
        const { available } = await getBalance(userId);
        throw new InsufficientCreditsError(turnEstimate, available);
      }
      const parsed = insufficientCreditsFromMessage(message, turnEstimate, 0);
      if (parsed) {
        const { available } = await getBalance(userId);
        throw new InsufficientCreditsError(turnEstimate, available);
      }
      throw error;
    }

    throwIfAborted(input.abortSignal);

    await appendChatMessage({
      sessionId: input.sessionId,
      role: "user",
      content: input.userMessage,
    });

    const history = await listChatMessages(input.sessionId);
    const client = new Anthropic({ apiKey });
    const system = buildCopilotSystemBlocks(input.context);

    const messages: Anthropic.MessageParam[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    let assistantText = "";
    const turnSummaries: string[] = [];
    const toolsUsedThisTurn = new Set<string>();

    let response = await streamAnthropicTurn({
      client,
      model,
      system,
      tools: COPILOT_TOOLS,
      messages,
      abortSignal: input.abortSignal,
      billing,
      onText: (text) => {
        assistantText += text;
        input.onEvent({ type: "text", content: text });
      },
    });

    while (response.stop_reason === "tool_use") {
      throwIfAborted(input.abortSignal);

      const toolBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      const waveGroups = groupCopilotToolsByWave(toolBlocks);

      async function runOneTool(tool: Anthropic.ToolUseBlock): Promise<Record<string, unknown>> {
        const args = tool.input as Record<string, unknown>;
        const toolId = tool.id;

        const emitProgress: ToolProgressEmitter = (detail, step, total) => {
          input.onEvent({
            type: "tool_progress",
            toolId,
            name: tool.name,
            message: formatToolRunningLabel(tool.name, detail),
            step,
            total,
          });
        };

        const emitOutput: OutputEmitter = (payload) => {
          if (payload.type === "ingredient_created" || payload.type === "sheet_created") {
            payload.toolId = toolId;
          }
          input.onEvent({ type: "copilot_output", payload });
        };

        try {
          return await executeTool(
            tool.name,
            args,
            input.context,
            emitProgress,
            emitOutput,
            { abortSignal: input.abortSignal, billing, userId },
          );
        } catch (error) {
          if (error instanceof CopilotAbortError) {
            throw error;
          }
          throw error;
        }
      }

      for (const wave of SETUP_WAVE_ORDER) {
        const waveTools = waveGroups.get(wave) ?? [];
        if (!waveTools.length) continue;

        for (const tool of waveTools) {
          throwIfAborted(input.abortSignal);
          const args = tool.input as Record<string, unknown>;
          input.onEvent({
            type: "tool_start",
            toolId: tool.id,
            name: tool.name,
            args,
          });
          await appendChatMessage({
            sessionId: input.sessionId,
            role: "tool",
            content: formatToolRunningLabel(tool.name),
            toolName: tool.name,
            toolArgs: args,
          });
        }

        const subWaves = wave === 0 ? splitGenerationSubWaves(waveTools) : [waveTools];

        for (const subWave of subWaves) {
          const parallelLimit =
            wave === 0 ? SETUP_GENERATION_CONCURRENCY : Math.max(subWave.length, 1);

          const outcomes = await runCopilotToolWave(subWave, parallelLimit, async (tool) =>
            runOneTool(tool),
          );

          for (const outcome of outcomes) {
            const tool = outcome.tool;
            const args = tool.input as Record<string, unknown>;

            if (outcome.error instanceof CopilotAbortError) {
              throw outcome.error;
            }

            const result =
              outcome.result ??
              ({
                error:
                  outcome.error instanceof Error
                    ? outcome.error.message
                    : "Tool execution failed.",
              } satisfies Record<string, unknown>);

            const summary = formatToolDoneSummary(tool.name, result);
            turnSummaries.push(summary);
            toolsUsedThisTurn.add(tool.name);

            input.onEvent({
              type: "tool_done",
              toolId: tool.id,
              name: tool.name,
              result,
              summary,
            });

            await appendChatMessage({
              sessionId: input.sessionId,
              role: "tool",
              content: summary,
              toolName: tool.name,
              toolArgs: args,
              toolResult: result,
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: JSON.stringify(result),
            });
          }
        }
      }

      throwIfAborted(input.abortSignal);

      response = await streamAnthropicTurn({
        client,
        model,
        system,
        tools: COPILOT_TOOLS,
        messages: [
          ...messages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ],
        abortSignal: input.abortSignal,
        billing,
        onText: (text) => {
          assistantText += text;
          input.onEvent({ type: "text", content: text });
        },
      });
    }

    if (assistantText.trim()) {
      await appendChatMessage({
        sessionId: input.sessionId,
        role: "assistant",
        content: assistantText.trim(),
      });
    }

    if (turnSummaries.length) {
      const turnSummary = turnSummaries.join(" · ");
      input.onEvent({ type: "turn_complete", summary: turnSummary });
    }

    const episodeIdForSummary = input.context.episodeId?.trim();
    const turnEndSummaryTools = [...toolsUsedThisTurn].filter(
      (tool) => tool === "bind_identity" || tool === "update_series_memory",
    );
    if (episodeIdForSummary && !toolsUsedThisTurn.has("draft_storyboard") && turnEndSummaryTools.length) {
      scheduleEpisodeSummaryRefresh({
        episodeId: episodeIdForSummary,
        userId,
        turnNotes: turnSummaries,
      });
    }

    await settleTurn();
    input.onEvent({ type: "done" });
  } catch (error) {
    if (isAbortError(error)) {
      await settleTurn();
      input.onEvent({
        type: "aborted",
        message: "Stopped.",
        inFlightNote: billing.inFlightNote,
      });
      input.onEvent({ type: "done" });
      return;
    }

    if (reservationId && !turnSettled) {
      await releaseReservation(reservationId);
      turnSettled = true;
    }

    if (isInsufficientCreditsError(error)) {
      input.onEvent({
        type: "error",
        message: `Not enough credits. Need ${error.needed}, you have ${error.available}.`,
        insufficientCredits: toInsufficientCreditsPayload(error),
      });
    } else {
      input.onEvent({
        type: "error",
        message: error instanceof Error ? error.message : "Co-pilot request failed.",
      });
    }
    input.onEvent({ type: "done" });
  }
}
