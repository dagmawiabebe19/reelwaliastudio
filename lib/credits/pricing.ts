/**
 * Credit pricing — single source of truth for all generation costs.
 * Server reserve/commit uses these functions; UI may import for previews only.
 *
 * Dollar → credit derivation:
 *   credits = ceil(provider_usd * MARKUP * CREDITS_PER_DOLLAR)
 */

export const CREDITS_PER_DOLLAR = 10;
export const MARKUP = 2.0;

/** FLAG: verify real gpt-image-2 rate against OpenAI pricing before tuning. */
export const OPENAI_IMAGE_BASE_USD_PER_IMAGE = 0.04;

/** @deprecated Use estimateCopilotTurnCredits(modelId) for reserve; commit is usage-based. */
export const COPILOT_TURN_CREDITS = 1;

export type AnthropicModelPricing = {
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
  /** Cache write = base input × this (Anthropic: 1.25×). */
  cacheWriteMultiplier: number;
  /** Cache read = base input × this (Anthropic: 0.1×). */
  cacheReadMultiplier: number;
};

/**
 * Per-model Anthropic API rates (USD per million tokens).
 * Cache multipliers follow Anthropic prompt caching docs.
 */
export const ANTHROPIC_MODEL_PRICING: Record<string, AnthropicModelPricing> = {
  "claude-opus-4-8": {
    inputUsdPerMtok: 5,
    outputUsdPerMtok: 25,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-opus-4-1-20250805": {
    inputUsdPerMtok: 15,
    outputUsdPerMtok: 75,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-sonnet-4-6": {
    inputUsdPerMtok: 3,
    outputUsdPerMtok: 15,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-sonnet-4-5-20250929": {
    inputUsdPerMtok: 3,
    outputUsdPerMtok: 15,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-haiku-4-5-20251001": {
    inputUsdPerMtok: 1,
    outputUsdPerMtok: 5,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
  "claude-3-5-haiku-20241022": {
    inputUsdPerMtok: 0.8,
    outputUsdPerMtok: 4,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
  },
};

const SEEDANCE_BASE_USD_PER_SECOND: Record<string, number> = {
  "fast:480p": 0.121,
  "fast:720p": 0.2419,
  "standard:720p": 0.3034,
};

export type AnthropicUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function usdToCredits(usd: number): number {
  return Math.ceil(usd * MARKUP * CREDITS_PER_DOLLAR);
}

export function getAnthropicModelPricing(modelId: string): AnthropicModelPricing {
  return (
    ANTHROPIC_MODEL_PRICING[modelId] ??
    ANTHROPIC_MODEL_PRICING["claude-opus-4-8"]
  );
}

/** Provider USD for one Anthropic Messages API call (or accumulated turn usage). */
export function copilotTurnUsdFromUsage(
  modelId: string,
  usage: AnthropicUsageLike,
): number {
  const rates = getAnthropicModelPricing(modelId);
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  const inputUsd = (inputTokens / 1_000_000) * rates.inputUsdPerMtok;
  const outputUsd = (outputTokens / 1_000_000) * rates.outputUsdPerMtok;
  const cacheWriteUsd =
    (cacheCreation / 1_000_000) * rates.inputUsdPerMtok * rates.cacheWriteMultiplier;
  const cacheReadUsd =
    (cacheRead / 1_000_000) * rates.inputUsdPerMtok * rates.cacheReadMultiplier;

  return inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd;
}

export function copilotTurnCreditsFromUsage(
  modelId: string,
  usage: AnthropicUsageLike,
): number {
  const usd = copilotTurnUsdFromUsage(modelId, usage);
  if (usd <= 0) return 0;
  return usdToCredits(usd);
}

/**
 * Conservative upfront reserve so non-admins are blocked before the Anthropic call.
 * Assumes a typical turn without cache reads (first turn in session).
 */
export function estimateCopilotTurnCredits(modelId: string): number {
  const rates = getAnthropicModelPricing(modelId);
  const typicalInputTokens = 14_000;
  const typicalOutputTokens = 1_800;
  const usd =
    (typicalInputTokens / 1_000_000) * rates.inputUsdPerMtok +
    (typicalOutputTokens / 1_000_000) * rates.outputUsdPerMtok;
  return Math.max(1, usdToCredits(usd));
}

export function formatCopilotUsageCostLog(input: {
  modelId: string;
  usage: AnthropicUsageLike;
  creditsCommitted?: number;
  turnLabel?: string;
}): string {
  const usd = copilotTurnUsdFromUsage(input.modelId, input.usage);
  const credits = input.creditsCommitted ?? copilotTurnCreditsFromUsage(input.modelId, input.usage);
  const prefix = input.turnLabel ? `[${input.turnLabel}] ` : "";
  return (
    `${prefix}model=${input.modelId} ` +
    `in=${input.usage.input_tokens ?? 0} ` +
    `out=${input.usage.output_tokens ?? 0} ` +
    `cache_write=${input.usage.cache_creation_input_tokens ?? 0} ` +
    `cache_read=${input.usage.cache_read_input_tokens ?? 0} ` +
    `usd=$${usd.toFixed(4)} credits=${credits}`
  );
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
  anthropicModels: ANTHROPIC_MODEL_PRICING,
} as const;
