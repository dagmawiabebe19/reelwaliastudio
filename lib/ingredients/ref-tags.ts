import type { AssetMediaType, IngredientKind } from "@/lib/db/types";

export function refPrefixForIngredient(
  kind: IngredientKind,
  mediaType: AssetMediaType = "image",
): string {
  if (kind === "voice") return "voice";
  if (kind === "reference") {
    if (mediaType === "video") return "video";
    if (mediaType === "audio") return "audio";
    return "image";
  }
  return "image";
}

export function formatRefTag(prefix: string, number: number): string {
  return `[${prefix}${number}]`;
}

export function parseRefTag(refTag: string): { prefix: string; number: number } | null {
  const match = refTag.match(/^\[([a-z]+)(\d+)\]$/i);
  if (!match) return null;
  return { prefix: match[1].toLowerCase(), number: Number(match[2]) };
}

export function nextRefNumber(existingTags: string[], prefix: string): number {
  const numbers = existingTags
    .map(parseRefTag)
    .filter((parsed): parsed is { prefix: string; number: number } => parsed !== null)
    .filter((parsed) => parsed.prefix === prefix)
    .map((parsed) => parsed.number);

  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

export function nextLineRefNumber(existingTags: string[]): number {
  const numbers = existingTags
    .map((tag) => {
      const match = tag.match(/^\[line(\d+)\]$/i);
      return match ? Number(match[1]) : null;
    })
    .filter((n): n is number => n !== null);

  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}
