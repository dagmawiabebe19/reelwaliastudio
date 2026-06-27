import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createPendingTakes, executeGenerationJob } from "@/lib/ai/generation/run";
import { getModelById, isModelConfigured } from "@/lib/ai/registry";
import { createIngredient } from "@/lib/db/ingredients";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";
import { createScene, getScene, updateScene } from "@/lib/db/scenes";
import { COPILOT_MODELS } from "@/lib/ai/copilot/constants";
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

      for (const segment of segments) {
        const sceneId = segment.scene_id ? String(segment.scene_id) : null;
        const title = String(segment.title ?? "").trim();
        const prompt = String(segment.prompt ?? "").trim();
        if (!title) continue;

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
          created.push(scene.id);
        }
      }

      return { created, updated, count: created.length + updated.length };
    }

    case "add_ingredient": {
      const seriesId = String(args.series_id);
      const kind = args.kind as Parameters<typeof createIngredient>[0]["kind"];
      const name = String(args.name ?? "").trim();
      const description = args.description ? String(args.description) : undefined;
      const ingredient = await createIngredient({ seriesId, kind, name, description });
      return { ingredient_id: ingredient.id, ref_tag: ingredient.ref_tag };
    }

    case "bind_identity": {
      const sceneId = String(args.scene_id);
      const ingredientIds = (args.ingredient_ids as string[]) ?? [];
      for (const ingredientId of ingredientIds) {
        await bindIngredientToScene(sceneId, ingredientId, "identity_lock");
      }
      return { bound: ingredientIds.length };
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

      const takeIds = await createPendingTakes({
        sceneId,
        seriesId,
        episodeId,
        modelId,
        count,
        resolution,
        durationSeconds,
      });

      void executeGenerationJob(
        { sceneId, seriesId, episodeId, modelId, count, resolution, durationSeconds },
        takeIds,
      );

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
  const model =
    input.modelId ??
    process.env.ANTHROPIC_MODEL?.trim() ??
    COPILOT_MODELS[0].id;

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
