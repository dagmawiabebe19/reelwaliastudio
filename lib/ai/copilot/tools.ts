import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getPublicModelCatalog } from "@/lib/ai/registry";

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
    name: "create_character_sheet",
    description:
      "Create and generate a character turnaround sheet (5 angles). Links to episodes via character_sheet_episodes. Requires character headshot; optional costume.",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string" },
        character_id: { type: "string" },
        name: { type: "string", description: "Sheet label, e.g. 'Ep 1 default'" },
        costume_id: { type: "string", description: "Optional costume ingredient id" },
        episode_ids: {
          type: "array",
          items: { type: "string" },
          description: "Episodes this sheet applies to",
        },
      },
      required: ["series_id", "character_id", "name"],
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
      "Trigger image or video generation for a scene. Image models use identity-lock references. Video models (higgsfield, seedance) animate a ready storyboard image take — star a take or use the latest ready image. Pass duration (6/7/8) for video.",
    input_schema: {
      type: "object",
      properties: {
        scene_id: { type: "string" },
        model: {
          type: "string",
          description:
            "Registry model id such as openai-image, higgsfield, or seedance. Omit to use the composer default image model. Use higgsfield or seedance for video.",
        },
        count: { type: "number", description: "Image takes only (1–5). Video always generates 1 take." },
        resolution: { type: "string", enum: ["480p", "720p"] },
        duration: { type: "number", enum: [6, 7, 8], description: "Required for video models." },
      },
      required: ["scene_id"],
    },
  },
  {
    name: "update_series_memory",
    description:
      "Append a persistent fact or production preference to series memory. Use when the user states a rule, correction, or canonical world detail that must apply in all future sessions for this series.",
    input_schema: {
      type: "object",
      properties: {
        series_id: { type: "string" },
        entry: {
          type: "string",
          description: "The preference, correction, or world fact to remember",
        },
        section: {
          type: "string",
          enum: ["world", "preferences"],
          description:
            "preferences (default) for rules/corrections; world for canonical facts like character looks or locations",
        },
      },
      required: ["series_id", "entry"],
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
  seriesMemoryMarkdown?: string;
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
  preferredImageModel?: string | null;
  preferredVideoModel?: string | null;
  workspace?: {
    view: string;
    viewLabel: string;
    episodeTitle?: string;
    sceneTitle?: string;
    scenePrompt?: string | null;
    sceneActLabel?: string | null;
    selectedCharacterName?: string;
    selectedIngredientName?: string;
    activeTakeSummary?: string;
  };
};

export function buildSystemPrompt(context: CopilotContext): string {
  const characters = (context.ingredients ?? []).filter((i) => i.kind === "character");
  const costumes = (context.ingredients ?? []).filter((i) => i.kind === "outfit");
  const locations = (context.ingredients ?? []).filter((i) => i.kind === "location");
  const voices = (context.ingredients ?? []).filter((i) => i.kind === "voice");

  const generationModels = getPublicModelCatalog().filter(
    (m) => (m.kind === "image" || m.kind === "video") && m.configured,
  );
  const modelsSection = `
## Generation models (generate_take)
Use these exact registry ids — never pass generic words like "image" or "video":
${generationModels.map((m) => `- ${m.id} (${m.label}, ${m.kind})`).join("\n") || "(none configured — set API keys)"}
Composer default image model: ${context.preferredImageModel ?? "(first configured image model)"}
If model is omitted in generate_take, the composer default image model is used.
`;

  const pipelineNotes = `
## Production pipeline (follow this order)
1. **Characters** — generate clean neutral headshots (identity reference). Never use scene mood.
2. **Costumes** — linked to a character; generate preview via headshot + costume description.
3. **Character sheets** — turnaround (front, profiles, 3/4, back) locking face + wardrobe. One sheet links to many episodes via character_sheet_episodes — never duplicate per episode.
4. **Locations** — clean establishing shots.
5. **Voices** — description for timbre/age/accent; generation is stubbed until provider is wired.
6. **Storyboard** — bind SHEETS (not raw headshots) per segment. generate_take uses sheet angle images + location for images. For video (higgsfield / seedance), a ready image take must exist — prefer the starred take as the source frame.
7. **Series memory** — follow ## Series memory in context. When the user states a new canonical fact (wardrobe rules, character traits, world details), ask: "Would you like me to save this as canon?" and wait for confirmation before calling update_series_memory. If they explicitly say to save/remember it, call update_series_memory immediately.

When drafting, reference ingredients by name/ref_tag. If a character appears but no sheet exists for this episode, flag it and offer to create one (pick costume + episodes, then generate sheet).

The creator is always in context — see ## Where the creator is right now. Never ask which scene, episode, or character they mean unless the workspace block is empty. Interpret short requests ("rewrite this", "generate it", "make it more emotional") against the current scene and selections.
`;

  const workspace = context.workspace;
  const workspaceSection = workspace
    ? `
## Where the creator is right now
- View: ${workspace.viewLabel} (${workspace.view})
${workspace.episodeTitle ? `- Episode: ${workspace.episodeTitle}` : ""}
${workspace.sceneTitle ? `- Scene: ${workspace.sceneTitle}${workspace.sceneActLabel ? ` (${workspace.sceneActLabel})` : ""}` : ""}
${workspace.scenePrompt ? `- Current scene prompt:\n${workspace.scenePrompt}` : ""}
${workspace.selectedCharacterName ? `- Focus character: ${workspace.selectedCharacterName}` : ""}
${workspace.selectedIngredientName ? `- Focus ingredient: ${workspace.selectedIngredientName}` : ""}
${workspace.activeTakeSummary ? `- Render status: ${workspace.activeTakeSummary}` : ""}
`
    : "";

  return `You are the ReelWalia Studio co-pilot — an AI production partner (director, writer, cinematographer, script supervisor, producer, editor, showrunner). The creator directs; you handle production.

## Series memory (persistent — always follow)
${context.seriesMemoryMarkdown?.trim() || "(empty — use update_series_memory when the user confirms canonical facts)"}
${workspaceSection}
Series: ${context.seriesTitle} (${context.seriesId})
Default orientation: ${context.defaultOrientation} (portrait = 9:16, landscape = 16:9)
${context.episodeId ? `Episode id: ${context.episodeId}${workspace?.episodeTitle ? ` — ${workspace.episodeTitle}` : ""}` : ""}
${context.sceneId ? `Active scene id: ${context.sceneId}` : ""}
${modelsSection}
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
