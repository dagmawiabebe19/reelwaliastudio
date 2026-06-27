import "server-only";

import {
  COPILOT_MODELS,
  DEFAULT_COPILOT_MODEL,
  isCopilotModelId,
} from "@/lib/ai/copilot/constants";

/** ANTHROPIC_MODEL env overrides default; explicit modelId from client wins when valid. */
export function resolveCopilotModel(modelId?: string | null): string {
  if (modelId && isCopilotModelId(modelId)) {
    return modelId;
  }
  const fromEnv = process.env.ANTHROPIC_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_COPILOT_MODEL;
}

export function listCopilotModelIds(): string[] {
  return COPILOT_MODELS.map((m) => m.id);
}
