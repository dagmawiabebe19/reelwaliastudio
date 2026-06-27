/** Default when ANTHROPIC_MODEL env is unset. */
export const DEFAULT_COPILOT_MODEL = "claude-sonnet-4-6";

export const COPILOT_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
] as const;

export type CopilotModelId = (typeof COPILOT_MODELS)[number]["id"];

export function isCopilotModelId(id: string): id is CopilotModelId {
  return COPILOT_MODELS.some((m) => m.id === id);
}
