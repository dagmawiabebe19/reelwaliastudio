import {
  isCharacterCue,
  isSlugline,
  isTransition,
  normalizeCharacterName,
  parseSlugline,
} from "@/lib/screenplay/slugline";
import type { ScreenplayParseResult } from "@/lib/screenplay/types";

type RawBlock = {
  kind: "slugline" | "other";
  text: string;
};

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""));
}

function cleanScreenplayArtifacts(text: string): string {
  return text
    .replace(/\f/g, "\n")
    .replace(/\(MORE\)/gi, "")
    .replace(/\bCONT'D\b/gi, "")
    .replace(/\bCONTINUED:\b/gi, "")
    .replace(/^\s*\d+\.\s*$/gm, "")
    .replace(/^\s*page\s+\d+\s*$/gim, "")
    .replace(/^\s*-\s*\d+\s*-\s*$/gm, "");
}

function classifyBlocks(lines: string[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    blocks.push({
      kind: isSlugline(trimmed) ? "slugline" : "other",
      text: trimmed,
    });
  }
  return blocks;
}

function estimatePages(text: string): number {
  const chars = text.replace(/\s+/g, " ").trim().length;
  if (chars === 0) return 0;
  return Math.max(1, Math.ceil(chars / 2500));
}

export function structureScreenplayText(
  text: string,
  pageCountEst?: number | null,
): ScreenplayParseResult | { error: string } {
  const cleaned = cleanScreenplayArtifacts(text);
  const lines = splitLines(cleaned);
  const blocks = classifyBlocks(lines);

  const sluglineBlocks = blocks.filter((b) => b.kind === "slugline");
  if (sluglineBlocks.length === 0) {
    return {
      error:
        "This file doesn't look like a screenplay — no scene headings (INT./EXT.) were found. Try .fdx or .fountain for best results.",
    };
  }

  const scenes: ScreenplayParseResult["scenes"] = [];
  let currentSlugline: string | null = null;
  let currentLines: string[] = [];
  let unrecognizedBlocks = 0;
  let nonSluglineBlocks = 0;
  const characterSet = new Set<string>();
  const locationSet = new Set<string>();

  function flushScene() {
    if (!currentSlugline) return;
    const { intExt, location, timeOfDay } = parseSlugline(currentSlugline);
    if (location) locationSet.add(location);

    const characters = new Set<string>();
    const bodyLines: string[] = [currentSlugline];

    for (const line of currentLines) {
      bodyLines.push(line);
      if (isCharacterCue(line)) {
        characters.add(normalizeCharacterName(line));
      }
    }

    for (const name of characters) characterSet.add(name);

    scenes.push({
      sceneNumber: scenes.length + 1,
      slugline: currentSlugline,
      location,
      intExt,
      timeOfDay,
      characters: [...characters].sort(),
      fullText: bodyLines.join("\n"),
      sortOrder: scenes.length,
    });
  }

  for (const block of blocks) {
    if (block.kind === "slugline") {
      if (currentSlugline) flushScene();
      currentSlugline = block.text;
      currentLines = [];
      continue;
    }

    nonSluglineBlocks += 1;
    if (isTransition(block.text)) {
      unrecognizedBlocks += 1;
      continue;
    }

    if (!currentSlugline) {
      unrecognizedBlocks += 1;
      continue;
    }

    currentLines.push(block.text);
  }

  if (currentSlugline) flushScene();

  const unrecognizedBlocksPct =
    nonSluglineBlocks === 0 ? 0 : Math.round((unrecognizedBlocks / nonSluglineBlocks) * 1000) / 10;

  return {
    scenes,
    pageCountEst: pageCountEst ?? estimatePages(cleaned),
    unrecognizedBlocksPct,
    characterNames: [...characterSet].sort(),
    locationNames: [...locationSet].sort(),
  };
}
