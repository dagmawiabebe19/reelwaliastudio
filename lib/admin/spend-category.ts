export type SpendCategory = "video" | "image" | "sheet" | "copilot" | "other";

/** Classify committed spend from reservation reference prefixes. */
export function categorizeSpendReference(reference: string | null | undefined): SpendCategory {
  if (!reference) return "other";
  const ref = reference.toLowerCase();
  if (ref.startsWith("seedance:")) return "video";
  if (ref.includes(":sheet:") || ref.startsWith("openai-image:sheet:")) return "sheet";
  if (
    ref.includes(":ingredient:") ||
    ref.startsWith("openai-image:") ||
    ref.startsWith("seedream:") ||
    ref.startsWith("nano-banana:") ||
    ref.startsWith("grok:")
  ) {
    return "image";
  }
  if (ref.startsWith("copilot:") || ref.startsWith("episode-summary:")) return "copilot";
  return "other";
}
