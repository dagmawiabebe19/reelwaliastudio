import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { ScreenplaySceneRow } from "@/lib/db/screenplays";
import type { MapChunkSceneResult, ScreenplayBreakdownProposal } from "@/lib/screenplay/analysis/types";

export const SCREENPLAY_REDUCE_MODEL = "claude-opus-4-8" as const;

const REDUCE_SYSTEM = `You are a showrunner adapting a screenplay into a serialized short-form video series.

Return ONLY valid JSON (no markdown fences) matching:
{
  "toneNotes": "series tone/style for memory",
  "characters": [{ "key": "maya", "name": "Maya", "appearance": "...", "sceneCount": 12 }],
  "locations": [{ "key": "coffee_shop", "name": "Coffee Shop", "description": "plate-ready description" }],
  "structures": {
    "faithful": {
      "label": "Faithful",
      "episodes": [{
        "key": "ep01",
        "title": "Episode title",
        "logline": "one line",
        "sceneSortOrders": [0, 1, 2]
      }]
    },
    "vertical": {
      "label": "Vertical adaptation",
      "episodes": [{
        "key": "vep01",
        "title": "Episode title",
        "logline": "one line",
        "hook": "opening hook",
        "cliffhanger": "end beat",
        "sceneSortOrders": [0, 1],
        "isPaywall": false
      }],
      "paywallEpisodeKey": "vep03"
    }
  }
}

Rules:
- characters/locations: merge duplicates; appearance/description ready for image generation later (no image prompts)
- FAITHFUL: scene-by-scene grouping into episodes preserving order
- VERTICAL: ~60-90s episodes, strong hooks/cliffhangers, suggest one paywall episode
- sceneSortOrders reference input scene sort_order integers exactly
- keys: lowercase snake_case, unique`;

function buildReduceUserPrompt(input: {
  title: string;
  sceneIndex: Array<{ sort_order: number; slugline: string; synopsis: string }>;
  mapNotes: MapChunkSceneResult[];
}): string {
  const indexBlock = input.sceneIndex
    .map((s) => `${s.sort_order}. ${s.slugline} — ${s.synopsis}`)
    .join("\n");

  const notesBlock = input.mapNotes
    .map((scene) => {
      const chars = scene.character_notes
        .map((c) => `${c.name}: ${c.appearance}`)
        .join("; ");
      const locs = scene.location_notes
        .map((l) => `${l.name}: ${l.description}`)
        .join("; ");
      return `sort_order=${scene.sort_order}
synopsis: ${scene.synopsis}
characters: ${chars || "(none)"}
locations: ${locs || "(none)"}
props: ${scene.prop_mentions.join(", ") || "(none)"}`;
    })
    .join("\n\n");

  return `Screenplay: ${input.title}

## Scene index
${indexBlock}

## Per-scene enrichment
${notesBlock}`;
}

function parseReduceJson(text: string): ScreenplayBreakdownProposal {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  return JSON.parse(jsonText) as ScreenplayBreakdownProposal;
}

export async function reduceScreenplayBreakdown(input: {
  client: Anthropic;
  title: string;
  scenes: ScreenplaySceneRow[];
  mapNotes: MapChunkSceneResult[];
}): Promise<{ proposal: ScreenplayBreakdownProposal; usage: Anthropic.Messages.Usage }> {
  const sceneIndex = input.scenes.map((scene) => ({
    sort_order: scene.sort_order,
    slugline: scene.slugline,
    synopsis: scene.synopsis?.trim() || "(pending)",
  }));

  const response = await input.client.messages.create({
    model: SCREENPLAY_REDUCE_MODEL,
    max_tokens: 8192,
    system: REDUCE_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildReduceUserPrompt({
          title: input.title,
          sceneIndex,
          mapNotes: input.mapNotes,
        }),
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { proposal: parseReduceJson(text), usage: response.usage };
}
