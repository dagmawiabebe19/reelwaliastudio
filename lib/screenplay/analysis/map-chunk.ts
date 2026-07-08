import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { ScreenplaySceneRow } from "@/lib/db/screenplays";
import type { MapChunkResult } from "@/lib/screenplay/analysis/types";

export const SCREENPLAY_MAP_CHUNK_SIZE = 20;
export const SCREENPLAY_MAP_MODEL = "claude-haiku-4-5-20251001" as const;

const MAP_SYSTEM = `You analyze screenplay scenes for production breakdown.

Return ONLY valid JSON (no markdown fences) matching:
{
  "scenes": [
    {
      "sort_order": 0,
      "synopsis": "1-2 sentence beat summary",
      "character_notes": [{ "name": "MAYA", "appearance": "30s, sharp blazer, tired eyes" }],
      "location_notes": [{ "name": "Coffee shop", "description": "Busy morning commuter cafe, warm wood" }],
      "prop_mentions": ["espresso cup"]
    }
  ]
}

Rules:
- synopsis: 1-2 lines max per scene
- Harvest appearance/age/wardrobe from action lines when present; infer lightly only when strongly implied
- location_notes: production-ready plate descriptions
- Use screenplay character cue names (ALL CAPS) in character_notes.name`;

function buildChunkUserPrompt(scenes: ScreenplaySceneRow[]): string {
  const blocks = scenes.map((scene) => {
    return `### sort_order=${scene.sort_order}
slugline: ${scene.slugline}
characters: ${scene.characters.join(", ") || "(none)"}
---
${scene.full_text}`;
  });

  return `Analyze these screenplay scenes:\n\n${blocks.join("\n\n")}`;
}

function parseMapJson(text: string): MapChunkResult {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText) as MapChunkResult;
  if (!Array.isArray(parsed.scenes)) {
    throw new Error("Map chunk response missing scenes array.");
  }
  return parsed;
}

export async function mapScreenplayChunk(input: {
  client: Anthropic;
  scenes: ScreenplaySceneRow[];
}): Promise<{ result: MapChunkResult; usage: Anthropic.Messages.Usage }> {
  const response = await input.client.messages.create({
    model: SCREENPLAY_MAP_MODEL,
    max_tokens: 4096,
    system: MAP_SYSTEM,
    messages: [{ role: "user", content: buildChunkUserPrompt(input.scenes) }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { result: parseMapJson(text), usage: response.usage };
}
