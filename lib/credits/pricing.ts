/**
 * Credit pricing — single source of truth for all generation costs.
 * Server reserve/commit uses these functions; UI may import for previews only.
 *
 * Dollar → credit derivation:
 *   credits = ceil(provider_usd * MARKUP * CREDITS_PER_DOLLAR)
 * Example: $0.121/s × 2.0 markup × 10 credits/$ = 2.42 → 3 credits/s
 */

export const CREDITS_PER_DOLLAR = 10;
export const MARKUP = 2.0;

/** FLAG: verify real gpt-image-2 rate against OpenAI pricing before tuning. */
export const OPENAI_IMAGE_BASE_USD_PER_IMAGE = 0.04;

export const COPILOT_TURN_CREDITS = 1;

const SEEDANCE_BASE_USD_PER_SECOND: Record<string, number> = {
  "fast:480p": 0.121,
  "fast:720p": 0.2419,
  "standard:720p": 0.3034,
};

function usdToCredits(usd: number): number {
  return Math.ceil(usd * MARKUP * CREDITS_PER_DOLLAR);
}

function seedanceKey(tier: string, resolution: string): string {
  const normalizedTier = tier === "standard" ? "standard" : "fast";
  const normalizedResolution = resolution === "480p" ? "480p" : "720p";
  return `${normalizedTier}:${normalizedResolution}`;
}

export function estimateVideoCredits(input: {
  tier?: "standard" | "fast" | string;
  resolution: string;
  durationSeconds: number;
}): number {
  const tier = input.tier ?? "fast";
  const key = seedanceKey(tier, input.resolution);
  const baseUsd =
    SEEDANCE_BASE_USD_PER_SECOND[key] ??
    SEEDANCE_BASE_USD_PER_SECOND["fast:720p"];
  const seconds = Math.max(1, Math.ceil(input.durationSeconds));
  return usdToCredits(baseUsd * seconds);
}

export function estimateImageCredits(imageCount: number): number {
  const count = Math.max(0, Math.ceil(imageCount));
  if (count === 0) return 0;
  return usdToCredits(OPENAI_IMAGE_BASE_USD_PER_IMAGE * count);
}

export function estimateSheetCredits(): number {
  return estimateImageCredits(5);
}

export const PRICING_REFERENCE = {
  seedancePerSecond: SEEDANCE_BASE_USD_PER_SECOND,
  openAiImagePerImageUsd: OPENAI_IMAGE_BASE_USD_PER_IMAGE,
  copilotTurnCredits: COPILOT_TURN_CREDITS,
} as const;
