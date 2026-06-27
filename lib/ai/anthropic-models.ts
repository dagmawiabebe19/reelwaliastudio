/** Default when no model is selected and ANTHROPIC_MODEL env is unset. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

/** Single source for co-pilot dropdown labels and Anthropic API model strings. */
export const ANTHROPIC_MODELS = [
  { label: "Claude Opus 4.8", id: "claude-opus-4-8" },
  { label: "Claude Opus 4.1", id: "claude-opus-4-1-20250805" },
  { label: "Claude Sonnet 4.6", id: "claude-sonnet-4-6" },
  { label: "Claude Sonnet 4.5", id: "claude-sonnet-4-5-20250929" },
  { label: "Claude Haiku 4.5", id: "claude-haiku-4-5-20251001" },
  { label: "Claude Haiku 3.5", id: "claude-3-5-haiku-20241022" },
] as const;

export type AnthropicModelId = (typeof ANTHROPIC_MODELS)[number]["id"];

export function isAnthropicModelId(id: string): id is AnthropicModelId {
  return ANTHROPIC_MODELS.some((m) => m.id === id);
}

export function getAnthropicModelLabel(id: string): string | undefined {
  return ANTHROPIC_MODELS.find((m) => m.id === id)?.label;
}
