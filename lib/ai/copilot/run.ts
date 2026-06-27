import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createPendingTakes, executeGenerationJob } from "@/lib/ai/generation/run";
import {
  executeIngredientImageGeneration,
  getIngredientRefUrl,
} from "@/lib/ai/generation/ingredient-generation";
import {
  CHARACTER_HEADSHOT_PREFIX,
  LOCATION_ESTABLISHING_PREFIX,
  costumePreviewPrompt,
} from "@/lib/production/prompts";
import { executeSheetGeneration } from "@/lib/ai/generation/sheet-generation";
import { createCharacterSheet } from "@/lib/db/character-sheets";
import type { CopilotOutputEvent } from "@/lib/copilot/output";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { createIngredient, getIngredient } from "@/lib/db/ingredients";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";
import { bindSheetToScene } from "@/lib/db/scene-sheets";
import { createScene, getScene, updateScene } from "@/lib/db/scenes";
import { resolveGenerationModelId } from "@/lib/ai/copilot/resolve-generation-model";
import { resolveCopilotModel } from "@/lib/ai/copilot/resolve-model";
import { formatToolDoneSummary, formatToolRunningLabel } from "@/lib/ai/copilot/progress";
import {
  buildSystemPrompt,
  COPILOT_TOOLS,
  type CopilotContext,
} from "@/lib/ai/copilot/tools";
import { appendChatMessage, listChatMessages } from "@/lib/db/chat";
import { appendSeriesMemoryMarkdown } from "@/lib/db/series-memory";
import { getSeries } from "@/lib/db/series";
import type { GenerationProgressCallback } from "@/lib/generation/progress";

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
  | { type: "error"; message: string }
  | { type: "done" };

type ToolProgressEmitter = (detail: string, step?: number, total?: number) => void;
type OutputEmitter = (event: CopilotOutputEvent) => void;

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: CopilotContext,
  emitProgress: ToolProgressEmitter,
  emitOutput: OutputEmitter,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "draft_storyboard": {
      const episodeId = String(args.episode_id);
      const segments = (args.segments as Array<Record<string, unknown>>) ?? [];
      const created: string[] = [];
      const updated: string[] = [];
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

        let targetSceneId: string;

        if (sceneId) {
          await updateScene(sceneId, {
            title,
            prompt,
            act_label: segment.act_label ? String(segment.act_label) : undefined,
            duration_seconds:
              typeof segment.duration_seconds === "number" ? segment.duration_seconds : undefined,
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
            actLabel: segment.act_label ? String(segment.act_label) : "Storyboard-only",
          });
          await updateScene(scene.id, {
            prompt,
            duration_seconds:
              typeof segment.duration_seconds === "number" ? segment.duration_seconds : null,
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
      }

      return { created, updated, count: created.length + updated.length, resolved };
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

        const genResult = await executeIngredientImageGeneration({
          ingredientId: ingredient.id,
          prompt,
          refImageUrls,
          onProgress: (msg, step, total) => emitProgress(msg, step, total),
        });

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

      const genResult = await executeSheetGeneration(sheet.id, (msg, step, total) => {
        emitProgress(msg, step, total);
        if (step && total) {
          emitOutput({ type: "sheet_progress", sheetId: sheet.id, step, total });
        }
      });

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

    case "generate_take": {
      const sceneId = String(args.scene_id);
      const count = typeof args.count === "number" ? args.count : 1;
      const resolution = String(args.resolution ?? "720p");
      const durationSeconds = typeof args.duration === "number" ? args.duration : 6;

      const resolved = resolveGenerationModelId({
        requested: args.model != null ? String(args.model) : null,
        preferredImageModel: context.preferredImageModel,
        preferredVideoModel: context.preferredVideoModel,
      });
      if (!resolved.ok) {
        return { error: resolved.error };
      }

      const modelId = resolved.modelId;
      const model = resolved.model;

      const scene = await getScene(sceneId);
      if (!scene) return { error: "Scene not found." };

      const seriesId = context.seriesId;
      const episodeId = context.episodeId ?? scene.episode_id;

      emitProgress("creating pending takes…", 0, count);

      const takeIds = await createPendingTakes({
        sceneId,
        seriesId,
        episodeId,
        modelId,
        count,
        resolution,
        durationSeconds,
      });

      const onProgress: GenerationProgressCallback = (message, step, total) => {
        const label = model.kind === "video" ? "video" : "image";
        const detail =
          step && total
            ? `generating ${label} (${step}/${total}) — ${message}`
            : `generating ${label} — ${message}`;
        emitProgress(detail, step, total);
      };

      const outcome = await executeGenerationJob(
        { sceneId, seriesId, episodeId, modelId, count, resolution, durationSeconds },
        takeIds,
        onProgress,
      );

      return {
        take_ids: takeIds,
        status: outcome.failed === 0 ? "ready" : outcome.ready > 0 ? "partial" : "failed",
        ready_count: outcome.ready,
        failed_count: outcome.failed,
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

  const freshSeries = await getSeries(input.context.seriesId);
  if (freshSeries) {
    input.context.seriesMemoryMarkdown = freshSeries.memory_markdown ?? "";
  }

  await appendChatMessage({
    sessionId: input.sessionId,
    role: "user",
    content: input.userMessage,
  });

  const history = await listChatMessages(input.sessionId);
  const client = new Anthropic({ apiKey });
  const model = resolveCopilotModel(input.modelId);

  const messages: Anthropic.MessageParam[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  let assistantText = "";
  const turnSummaries: string[] = [];

  try {
    let response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(input.context),
      tools: COPILOT_TOOLS,
      messages,
    });

    while (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );

      for (const text of textBlocks) {
        assistantText += text.text;
        input.onEvent({ type: "text", content: text.text });
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolBlocks) {
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

        const result = await executeTool(
          tool.name,
          args,
          input.context,
          emitProgress,
          emitOutput,
        );
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

      response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: buildSystemPrompt(input.context),
        tools: COPILOT_TOOLS,
        messages: [
          ...messages,
          { role: "assistant", content: response.content },
          { role: "user", content: toolResults },
        ],
      });
    }

    for (const block of response.content) {
      if (block.type === "text") {
        assistantText += block.text;
        input.onEvent({ type: "text", content: block.text });
      }
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

    input.onEvent({ type: "done" });
  } catch (error) {
    input.onEvent({
      type: "error",
      message: error instanceof Error ? error.message : "Co-pilot request failed.",
    });
    input.onEvent({ type: "done" });
  }
}
