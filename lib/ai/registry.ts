export type AspectRatio = "9:16" | "16:9";
export type SafetyTag = "sfw" | "nsfw";
export type ModelKind = "image" | "video" | "voice";

export interface ModelDefinition {
  id: string;
  label: string;
  kind: ModelKind;
  safety: SafetyTag;
  envKey: string;
}

/** Ingredient-stage image models + segment video (Seedance only). */
export const MODEL_REGISTRY: ModelDefinition[] = [
  { id: "openai-image", label: "OpenAI Image", kind: "image", safety: "sfw", envKey: "OPENAI_API_KEY" },
  { id: "seedream", label: "Seedream", kind: "image", safety: "sfw", envKey: "FAL_KEY" },
  { id: "nano-banana", label: "Nano Banana", kind: "image", safety: "sfw", envKey: "FAL_KEY" },
  { id: "grok", label: "Grok Image", kind: "image", safety: "nsfw", envKey: "XAI_API_KEY" },
  { id: "seedance", label: "Seedance 2.0", kind: "video", safety: "sfw", envKey: "FAL_KEY" },
  { id: "azure-speech", label: "Azure Speech", kind: "voice", safety: "sfw", envKey: "AZURE_SPEECH_KEY" },
];

export const SEGMENT_VIDEO_MODEL_ID = "seedance" as const;

export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((model) => model.id === id);
}

export function getModelsByKind(kind: ModelKind): ModelDefinition[] {
  return MODEL_REGISTRY.filter((model) => model.kind === kind);
}

export function isModelConfigured(model: ModelDefinition): boolean {
  return Boolean(process.env[model.envKey]?.trim());
}

export function getConfiguredModels(kind?: ModelKind): ModelDefinition[] {
  const models = kind ? getModelsByKind(kind) : MODEL_REGISTRY;
  return models.filter(isModelConfigured);
}

export function isSeedanceConfigured(): boolean {
  const seedance = getModelById(SEGMENT_VIDEO_MODEL_ID);
  return seedance ? isModelConfigured(seedance) : false;
}

/** Client-safe list — only id, label, kind, safety (no env keys). */
export function getPublicModelCatalog(kind?: ModelKind) {
  const models = kind ? getModelsByKind(kind) : MODEL_REGISTRY;
  return models.map(({ id, label, kind: k, safety, envKey }) => ({
    id,
    label,
    kind: k,
    safety,
    configured: Boolean(process.env[envKey]?.trim()),
  }));
}
