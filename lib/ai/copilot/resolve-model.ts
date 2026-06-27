import "server-only";

import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  isAnthropicModelId,
} from "@/lib/ai/anthropic-models";

/** Request model wins when valid; else ANTHROPIC_MODEL env; else default Opus 4.8. */
export function resolveCopilotModel(modelId?: string | null): string {
  if (modelId && isAnthropicModelId(modelId)) {
    return modelId;
  }
  const fromEnv = process.env.ANTHROPIC_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_ANTHROPIC_MODEL;
}

export function listCopilotModelIds(): string[] {
  return ANTHROPIC_MODELS.map((m) => m.id);
}
