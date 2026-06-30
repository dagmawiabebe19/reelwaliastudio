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
  CHARACTER_HEADSHOT_PREFIX,
  LOCATION_ESTABLISHING_PREFIX,
  costumePreviewPrompt,
  normalizeShotIntent,
} from "@/lib/production/prompts";
import {
  inferAudioModeFromPrompt,
  normalizeGenerationTier,
  normalizeSeedanceAudioMode,
} from "@/lib/ai/video/seedance-constants";
import { executeSheetGeneration } from "@/lib/ai/generation/sheet-generation";
import { createCharacterSheet } from "@/lib/db/character-sheets";
import type { CopilotOutputEvent } from "@/lib/copilot/output";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { assessSegmentLock, assertIngredientReadyForBinding, assertSheetReadyForBinding } from "@/lib/production/reference-readiness";
import { createIngredient, getIngredient } from "@/lib/db/ingredients";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";
import { bindSheetToScene } from "@/lib/db/scene-sheets";
import { createScene, getScene, updateScene } from "@/lib/db/scenes";
import { resolveCopilotModel } from "@/lib/ai/copilot/resolve-model";
import { formatToolDoneSummary, formatToolRunningLabel } from "@/lib/ai/copilot/progress";
import {
  buildCopilotSystemBlocks,
  COPILOT_TOOLS,
  type CopilotContext,
} from "@/lib/ai/copilot/tools";
import { appendChatMessage, listChatMessages } from "@/lib/db/chat";
import { appendSeriesMemoryMarkdown } from "@/lib/db/series-memory";
import { getEpisode } from "@/lib/db/episodes";
import { getSeries } from "@/lib/db/series";
import { resolveActLabelForEpisode } from "@/lib/storyboard/episode-buckets";

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

      const segments = (args.segments as Array<Record<string, unknown>>) ?? [];
      const created: string[] = [];
      const updated: string[] = [];
      const builtSceneIds: string[] = [];
      const resolved: Array<{ scene_id: string; references: unknown[] }> = [];
      const total = segments.filter((s) => String(s.title ?? "").trim()).length;
      let index = 0;

      emitProgress("running…", 0, total || 1);

      for (const segment of segments) {
        const sceneId = segment.scene_id ? String(segment.scene_id) : null;
        const title = String(segment.title ?? "").trim();
        const prompt = String(segment.prompt ?? "").trim();
        if (!title) continue;

        index++;
        emitProgress(`writing segment ${index}/${total || index}: ${title}…`, index, total || index);

        const actLabel = resolveActLabelForEpisode(episode, segment.act_label);
        const shotIntent = normalizeShotIntent(
          typeof segment.shot_intent === "string" ? segment.shot_intent : null,
        );
        const audioMode =
          normalizeSeedanceAudioMode(
            typeof segment.audio_mode === "string" ? segment.audio_mode : null,
          ) ?? inferAudioModeFromPrompt(prompt);
        const generationTier =
          normalizeGenerationTier(
            typeof segment.generation_tier === "string" ? segment.generation_tier : null,
          ) ?? "fast";
        const durationSeconds =
          typeof segment.duration_seconds === "number"
            ? Math.min(15, Math.max(4, Math.round(segment.duration_seconds)))
            : undefined;

        let targetSceneId: string;

        if (sceneId) {
          await updateScene(sceneId, {
            title,
            prompt,
            act_label: actLabel,
            shot_intent: shotIntent,
            audio_mode: audioMode,
            generation_tier: generationTier,
            duration_seconds: durationSeconds,
            orientation:
              segment.orientation === "portrait" || segment.orientation === "landscape"
                ? segment.orientation
                : undefined,
          });
          targetSceneId = sceneId;
          updated.push(sceneId);
        } else {
          const scene = await createScene(episodeId, {
            title,
            actLabel,
          });
          await updateScene(scene.id, {
            prompt,
            shot_intent: shotIntent,
            audio_mode: audioMode,
            generation_tier: generationTier,
            duration_seconds: durationSeconds ?? null,
            orientation:
              segment.orientation === "portrait" || segment.orientation === "landscape"
                ? segment.orientation
                : null,
          });
          targetSceneId = scene.id;
          created.push(scene.id);
        }

        emitProgress(`resolving references for segment ${index}/${total || index}…`, index, total || index);

        const refs = await resolveSceneReferences({
          sceneId: targetSceneId,
          seriesId: context.seriesId,
          episodeId,
          autoBind: true,
        });
        resolved.push({ scene_id: targetSceneId, references: refs });
        builtSceneIds.push(targetSceneId);
      }

      const lockReport = await Promise.all(
        builtSceneIds.map((sceneId) =>
          assessSegmentLock({ sceneId, seriesId: context.seriesId, episodeId }),
        ),
      );

      revalidatePath(`/series/${context.seriesId}/episodes/${episodeId}`);

      return {
        episode_id: episodeId,
        created,
        updated,
        count: created.length + updated.length,
        resolved,
        lock_report: lockReport,
        fully_locked_count: lockReport.filter((row) => row.fully_locked).length,
        segment_count: lockReport.length,
      };
    }

    case "add_ingredient": {
      const seriesId = String(args.series_id);
      const kind = args.kind as Parameters<typeof createIngredient>[0]["kind"];
      const name = String(args.name ?? "").trim();
      const description = args.description ? String(args.description) : undefined;
      const characterId = args.character_id ? String(args.character_id) : undefined;
      const generate = args.generate === true;

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
          prompt = `${CHARACTER_HEADSHOT_PREFIX}${description}`;
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
      const sceneId = String(args.scene_id);
      const sheetIds = (args.character_sheet_ids as string[]) ?? [];
      const ingredientIds = (args.ingredient_ids as string[]) ?? [];
      const total = sheetIds.length + ingredientIds.length;

      for (const sheetId of sheetIds) {
        const block = await assertSheetReadyForBinding(sheetId);
        if (block) {
          return { error: block, sheet_id: sheetId, bound: false };
        }
      }
      for (const ingredientId of ingredientIds) {
        const block = await assertIngredientReadyForBinding(ingredientId);
        if (block) {
          return { error: block, ingredient_id: ingredientId, bound: false };
        }
      }

      emitProgress("binding identity locks…", 0, total || 1);

      let step = 0;
      for (const sheetId of sheetIds) {
        step++;
        emitProgress(`binding sheet ${step}/${total || step}…`, step, total || step);
        await bindSheetToScene(sceneId, sheetId, "identity_lock");
      }
      for (const ingredientId of ingredientIds) {
        step++;
        emitProgress(`binding ingredient ${step}/${total || step}…`, step, total || step);
        await bindIngredientToScene(sceneId, ingredientId, "reference");
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

      return { bound_sheets: sheetIds.length, bound_ingredients: ingredientIds.length };
    }

    case "create_character_sheet": {
      const seriesId = String(args.series_id);
      const characterId = String(args.character_id);
      const name = String(args.name ?? "").trim();
      const costumeId = args.costume_id ? String(args.costume_id) : null;
      const episodeIds = (args.episode_ids as string[]) ?? [];

      if (!name) return { error: "name is required." };

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
        characterName: character?.name ?? null,
        costumeName: costume?.name ?? null,
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
            sheet_id: sheet.id,
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
        sheet_id: sheet.id,
        name: sheet.name,
        character_name: character?.name ?? null,
        costume_name: costume?.name ?? null,
        status: genResult.status,
        error: genResult.error,
      };
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
    turnSettled = true;
    const creditsCommitted = resolveCopilotTurnCommitCredits(model, turnEstimate, billing);
    const outcome = await settleCopilotTurnReservation(reservationId, model, billing);
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

      for (const tool of toolBlocks) {
        throwIfAborted(input.abortSignal);

        const args = tool.input as Record<string, unknown>;
        const toolId = tool.id;

        input.onEvent({
          type: "tool_start",
          toolId,
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

        let result: Record<string, unknown>;
        try {
          result = await executeTool(
            tool.name,
            args,
            input.context,
            emitProgress,
            emitOutput,
            { abortSignal: input.abortSignal, billing },
          );
        } catch (error) {
          if (error instanceof CopilotAbortError) {
            throw error;
          }
          throw error;
        }

        const summary = formatToolDoneSummary(tool.name, result);
        turnSummaries.push(summary);

        input.onEvent({
          type: "tool_done",
          toolId,
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
