import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { createPendingTakes, executeGenerationJob } from "@/lib/ai/generation/run";
import {
  queueIngredientImageGeneration,
  getIngredientRefUrl,
} from "@/lib/ai/generation/ingredient-generation";
import { getModelById, isModelConfigured } from "@/lib/ai/registry";
import {
  CHARACTER_HEADSHOT_PREFIX,
  LOCATION_ESTABLISHING_PREFIX,
  costumePreviewPrompt,
} from "@/lib/production/prompts";
import { resolveSceneReferences } from "@/lib/production/resolve-references";
import { createIngredient, getIngredient } from "@/lib/db/ingredients";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";
import { bindSheetToScene } from "@/lib/db/scene-sheets";
import { createScene, getScene, updateScene } from "@/lib/db/scenes";
import { resolveCopilotModel } from "@/lib/ai/copilot/resolve-model";
import {
  buildSystemPrompt,
  COPILOT_TOOLS,
  type CopilotContext,
} from "@/lib/ai/copilot/tools";
import { appendChatMessage, listChatMessages } from "@/lib/db/chat";

export type CopilotStreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_done"; name: string; result: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: CopilotContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case "draft_storyboard": {
      const episodeId = String(args.episode_id);
      const segments = (args.segments as Array<Record<string, unknown>>) ?? [];
      const created: string[] = [];
      const updated: string[] = [];
      const resolved: Array<{ scene_id: string; references: unknown[] }> = [];

      for (const segment of segments) {
        const sceneId = segment.scene_id ? String(segment.scene_id) : null;
        const title = String(segment.title ?? "").trim();
        const prompt = String(segment.prompt ?? "").trim();
        if (!title) continue;

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

      const ingredient = await createIngredient({
        seriesId,
        kind,
        name,
        description,
        characterId: characterId ?? null,
        generationStatus: generate ? "pending" : "ready",
      });

      if (generate && description) {
        let prompt = description;
        let refImageUrls: string[] | undefined;

        if (kind === "character") {
          prompt = `${CHARACTER_HEADSHOT_PREFIX}${description}`;
        } else if (kind === "location") {
          prompt = `${LOCATION_ESTABLISHING_PREFIX}${description}`;
        } else if (kind === "outfit" && characterId) {
          const character = await getIngredient(characterId);
          if (!character) return { error: "Character not found." };
          const headshotUrl = await getIngredientRefUrl(characterId);
          if (!headshotUrl) {
            return { error: "Generate the character headshot first.", ingredient_id: ingredient.id };
          }
          prompt = costumePreviewPrompt(character.name, description);
          refImageUrls = [headshotUrl];
        } else {
          return { ingredient_id: ingredient.id, ref_tag: ingredient.ref_tag, note: "Generate not supported for this kind." };
        }

        await queueIngredientImageGeneration({
          ingredientId: ingredient.id,
          prompt,
          refImageUrls,
          revalidatePath: `/series/${seriesId}`,
        });
      }

      return { ingredient_id: ingredient.id, ref_tag: ingredient.ref_tag, generating: generate };
    }

    case "bind_identity": {
      const sceneId = String(args.scene_id);
      const sheetIds = (args.character_sheet_ids as string[]) ?? [];
      const ingredientIds = (args.ingredient_ids as string[]) ?? [];

      for (const sheetId of sheetIds) {
        await bindSheetToScene(sceneId, sheetId, "identity_lock");
      }
      for (const ingredientId of ingredientIds) {
        await bindIngredientToScene(sceneId, ingredientId, "reference");
      }

      const scene = await getScene(sceneId);
      const episodeId = context.episodeId ?? scene?.episode_id;
      if (episodeId) {
        await resolveSceneReferences({
          sceneId,
          seriesId: context.seriesId,
          episodeId,
          autoBind: false,
        });
      }

      return { bound_sheets: sheetIds.length, bound_ingredients: ingredientIds.length };
    }

    case "generate_take": {
      const sceneId = String(args.scene_id);
      const modelId = String(args.model);
      const count = typeof args.count === "number" ? args.count : 1;
      const resolution = String(args.resolution ?? "720p");
      const durationSeconds = typeof args.duration === "number" ? args.duration : 6;

      const model = getModelById(modelId);
      if (!model || !isModelConfigured(model)) {
        return { error: `Model ${modelId} is not configured.` };
      }

      const scene = await getScene(sceneId);
      if (!scene) return { error: "Scene not found." };

      const seriesId = context.seriesId;
      const episodeId = context.episodeId ?? scene.episode_id;

      await resolveSceneReferences({
        sceneId,
        seriesId,
        episodeId,
        autoBind: true,
      });

      const takeIds = await createPendingTakes({
        sceneId,
        seriesId,
        episodeId,
        modelId,
        count,
        resolution,
        durationSeconds,
      });

      after(async () => {
        await executeGenerationJob(
          { sceneId, seriesId, episodeId, modelId, count, resolution, durationSeconds },
          takeIds,
        );
      });

      return { take_ids: takeIds, status: "pending" };
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
        input.onEvent({ type: "tool_start", name: tool.name, args });

        await appendChatMessage({
          sessionId: input.sessionId,
          role: "tool",
          content: "",
          toolName: tool.name,
          toolArgs: args,
        });

        const result = await executeTool(tool.name, args, input.context);
        input.onEvent({ type: "tool_done", name: tool.name, result });

        await appendChatMessage({
          sessionId: input.sessionId,
          role: "tool",
          content: JSON.stringify(result),
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

    input.onEvent({ type: "done" });
  } catch (error) {
    input.onEvent({
      type: "error",
      message: error instanceof Error ? error.message : "Co-pilot request failed.",
    });
    input.onEvent({ type: "done" });
  }
}
