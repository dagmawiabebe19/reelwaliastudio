import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

export const COPILOT_TOOLS: Anthropic.Tool[] = [
  {
    name: "draft_storyboard",
    description:
      "Create or update scenes for an episode. Each segment becomes a scene with title, prompt, act label, duration, and optional orientation override.",
    input_schema: {
      type: "object",
      properties: {
        episode_id: { type: "string", description: "Episode UUID" },
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              prompt: { type: "string" },
              act_label: { type: "string" },
              duration_seconds: { type: "number" },
              orientation: { type: "string", enum: ["portrait", "landscape"] },
              scene_id: { type: "string", description: "If set, update existing scene" },
            },
            required: ["title", "prompt"],
          },
        },
      },
      required: ["episode_id", "segments"],
    },
  },
  {
    name: "add_ingredient",
    description: "Add a text-only ingredient (no file) to the series library.",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["character", "voice", "outfit", "location", "reference", "prop"],
        },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["series_id", "kind", "name"],
    },
  },
  {
    name: "bind_identity",
    description: "Bind ingredient identity locks to a scene for @mention generation.",
    input_schema: {
      type: "object",
      properties: {
        scene_id: { type: "string" },
        ingredient_ids: { type: "array", items: { type: "string" } },
      },
      required: ["scene_id", "ingredient_ids"],
    },
  },
  {
    name: "generate_take",
    description: "Trigger image or video generation for a scene.",
    input_schema: {
      type: "object",
      properties: {
        scene_id: { type: "string" },
        model: { type: "string" },
        count: { type: "number" },
        resolution: { type: "string", enum: ["480p", "720p"] },
        duration: { type: "number", enum: [6, 7, 8] },
      },
      required: ["scene_id", "model"],
    },
  },
];

export type CopilotContext = {
  seriesId: string;
  episodeId?: string;
  sceneId?: string;
  seriesTitle: string;
  defaultOrientation: string;
  briefMarkdown?: string;
  scenes?: Array<{ id: string; title: string; prompt: string | null; act_label: string | null }>;
  ingredients?: Array<{ id: string; ref_tag: string; name: string; kind: string }>;
};

export function buildSystemPrompt(context: CopilotContext): string {
  return `You are the ReelWalia Studio co-pilot — an AI production assistant for serialized short-form shows.

Series: ${context.seriesTitle} (${context.seriesId})
Default orientation: ${context.defaultOrientation} (portrait = 9:16, landscape = 16:9)
${context.episodeId ? `Episode: ${context.episodeId}` : ""}
${context.sceneId ? `Scene: ${context.sceneId}` : ""}

When drafting storyboard scenes:
- Respect the series default orientation unless a scene needs an override.
- Inject identity-lock bindings via bind_identity for character consistency.
- Use ⚠️ callout lines in prompts for ACCENTS, IDENTITY LOCK, etc. when needed.

Series brief:
${context.briefMarkdown || "(empty)"}

Available ingredients:
${(context.ingredients ?? []).map((i) => `- ${i.ref_tag} ${i.name} (${i.kind}) [${i.id}]`).join("\n") || "(none)"}

Current scenes:
${(context.scenes ?? []).map((s) => `- [${s.id}] ${s.act_label ?? "Storyboard-only"}: ${s.title}`).join("\n") || "(none)"}`;
}
