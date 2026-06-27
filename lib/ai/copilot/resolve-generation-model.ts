import "server-only";

import {
  getConfiguredModels,
  getModelById,
  getModelsByKind,
  isModelConfigured,
  type ModelDefinition,
  type ModelKind,
} from "@/lib/ai/registry";

export type ResolveGenerationModelResult =
  | { ok: true; modelId: string; model: ModelDefinition }
  | { ok: false; error: string };

const KIND_ALIASES: Record<string, ModelKind> = {
  image: "image",
  img: "image",
  photo: "image",
  still: "image",
  video: "video",
  vid: "video",
  motion: "video",
};

function resolveByKind(
  kind: ModelKind,
  preferredId?: string | null,
): ResolveGenerationModelResult {
  if (preferredId) {
    const preferred = getModelById(preferredId);
    if (preferred && preferred.kind === kind && isModelConfigured(preferred)) {
      return { ok: true, modelId: preferred.id, model: preferred };
    }
  }

  const configured = getConfiguredModels(kind);
  if (!configured.length) {
    const label = kind === "image" ? "image" : "video";
    return {
      ok: false,
      error: `No ${label} model configured — set API keys for an ${label} provider (e.g. OPENAI_API_KEY for openai-image).`,
    };
  }

  const model = configured[0];
  return { ok: true, modelId: model.id, model };
}

function findByLabel(requested: string): ModelDefinition | undefined {
  const needle = requested.toLowerCase();
  return getModelsByKind("image")
    .concat(getModelsByKind("video"))
    .find((m) => m.label.toLowerCase() === needle || m.label.toLowerCase().includes(needle));
}

/**
 * Resolve a co-pilot / UI model token to a concrete registry id (e.g. openai-image).
 * Accepts registry ids, generic kind words (image/video), or label hints; falls back to composer preference.
 */
export function resolveGenerationModelId(input: {
  requested?: string | null;
  preferredImageModel?: string | null;
  preferredVideoModel?: string | null;
}): ResolveGenerationModelResult {
  const raw = input.requested?.trim() ?? "";

  if (!raw) {
    return resolveByKind("image", input.preferredImageModel);
  }

  const kindAlias = KIND_ALIASES[raw.toLowerCase()];
  if (kindAlias) {
    const preferred =
      kindAlias === "video" ? input.preferredVideoModel : input.preferredImageModel;
    return resolveByKind(kindAlias, preferred);
  }

  const byId = getModelById(raw);
  if (byId) {
    if (byId.kind === "voice") {
      return { ok: false, error: "Voice models cannot generate scene takes — use an image or video model id." };
    }
    if (!isModelConfigured(byId)) {
      return {
        ok: false,
        error: `${byId.label} is not configured — set ${byId.envKey} to enable.`,
      };
    }
    return { ok: true, modelId: byId.id, model: byId };
  }

  const byLabel = findByLabel(raw);
  if (byLabel) {
    if (!isModelConfigured(byLabel)) {
      return {
        ok: false,
        error: `${byLabel.label} is not configured — set ${byLabel.envKey} to enable.`,
      };
    }
    return { ok: true, modelId: byLabel.id, model: byLabel };
  }

  return {
    ok: false,
    error: `'${raw}' isn't a valid model id — use a registry id like openai-image or seedance, or omit model to use the composer default.`,
  };
}
