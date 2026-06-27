import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

export const COPILOT_TOOLS: Anthropic.Tool[] = [
  {
    name: "draft_storyboard",
    description:
      "Create or update scenes for an episode. Each segment becomes a scene with title, prompt, act label, duration, and optional orientation override. Auto-resolves character sheets, locations, and voices per segment.",
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
    description:
      "Add an ingredient to the series library. Set generate=true to create character headshots, location establishing shots, or costume previews from description (OpenAI image). Costumes require character_id.",
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
        character_id: { type: "string", description: "Required for outfit; optional for voice" },
        generate: { type: "boolean", description: "Generate image from description (character, location, outfit)" },
      },
      required: ["series_id", "kind", "name"],
    },
  },
  {
    name: "bind_identity",
    description:
      "Bind character SHEETS (identity lock) to a scene. Prefer character_sheet_ids over raw ingredient_ids. Sheets lock face + wardrobe across angles.",
    input_schema: {
      type: "object",
      properties: {
        scene_id: { type: "string" },
        character_sheet_ids: { type: "array", items: { type: "string" } },
        ingredient_ids: {
          type: "array",
          items: { type: "string" },
          description: "Fallback: bind location/reference ingredients only",
        },
      },
      required: ["scene_id"],
    },
  },
  {
    name: "generate_take",
    description:
      "Trigger image or video generation for a scene. Auto-resolves and binds character sheets + location references before generating.",
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
  ingredients?: Array<{
    id: string;
    ref_tag: string;
    name: string;
    kind: string;
    character_id?: string | null;
    generation_status?: string;
  }>;
  characterSheets?: Array<{
    id: string;
    name: string;
    character_id: string;
    character_name: string;
    costume_name: string | null;
    status: string;
    episode_ids: string[];
  }>;
};

export function buildSystemPrompt(context: CopilotContext): string {
  const characters = (context.ingredients ?? []).filter((i) => i.kind === "character");
  const costumes = (context.ingredients ?? []).filter((i) => i.kind === "outfit");
  const locations = (context.ingredients ?? []).filter((i) => i.kind === "location");
  const voices = (context.ingredients ?? []).filter((i) => i.kind === "voice");

  const pipelineNotes = `
## Production pipeline (follow this order)
1. **Characters** — generate clean neutral headshots (identity reference). Never use scene mood.
2. **Costumes** — linked to a character; generate preview via headshot + costume description.
3. **Character sheets** — turnaround (front, profiles, 3/4, back) locking face + wardrobe. One sheet links to many episodes via character_sheet_episodes — never duplicate per episode.
4. **Locations** — clean establishing shots.
5. **Voices** — description for timbre/age/accent; generation is stubbed until provider is wired.
6. **Storyboard** — bind SHEETS (not raw headshots) per segment. generate_take uses sheet angle images + location.

When drafting, reference ingredients by name/ref_tag. If a character appears but no sheet exists for this episode, flag it and offer to create one (pick costume + episodes, then generate sheet).
`;

  return `You are the ReelWalia Studio co-pilot — an AI production assistant for serialized short-form shows.

Series: ${context.seriesTitle} (${context.seriesId})
Default orientation: ${context.defaultOrientation} (portrait = 9:16, landscape = 16:9)
${context.episodeId ? `Episode: ${context.episodeId}` : ""}
${context.sceneId ? `Scene: ${context.sceneId}` : ""}
${pipelineNotes}

When drafting storyboard scenes:
- Respect the series default orientation unless a scene needs an override.
- Use bind_identity with character_sheet_ids for identity locks.
- Use ⚠️ callout lines in prompts for ACCENTS, IDENTITY LOCK, etc. when needed.

Series brief:
${context.briefMarkdown || "(empty)"}

Characters:
${characters.map((i) => `- ${i.ref_tag} ${i.name} [${i.id}] status=${i.generation_status ?? "ready"}`).join("\n") || "(none)"}

Costumes:
${costumes.map((i) => `- ${i.ref_tag} ${i.name} (character ${i.character_id ?? "?"}) [${i.id}]`).join("\n") || "(none)"}

Character sheets:
${(context.characterSheets ?? []).map((s) => `- [${s.id}] ${s.character_name}${s.costume_name ? ` · ${s.costume_name}` : ""} — ${s.name} (${s.status}) episodes: ${s.episode_ids.join(", ") || "all"}`).join("\n") || "(none)"}

Locations:
${locations.map((i) => `- ${i.ref_tag} ${i.name} [${i.id}]`).join("\n") || "(none)"}

Voices:
${voices.map((i) => `- ${i.ref_tag} ${i.name} [${i.id}]`).join("\n") || "(none)"}

Other ingredients:
${(context.ingredients ?? []).filter((i) => !["character", "outfit", "location", "voice"].includes(i.kind)).map((i) => `- ${i.ref_tag} ${i.name} (${i.kind}) [${i.id}]`).join("\n") || "(none)"}

Current scenes:
${(context.scenes ?? []).map((s) => `- [${s.id}] ${s.act_label ?? "Storyboard-only"}: ${s.title}`).join("\n") || "(none)"}`;
}
