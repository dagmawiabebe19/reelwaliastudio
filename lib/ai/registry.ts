export type AspectRatio = "9:16" | "16:9";
export type SafetyTag = "sfw" | "nsfw";
export type ModelKind = "image" | "video" | "voice";

export interface ModelDefinition {
  id: string;
  label: string;
  kind: ModelKind;
  safety: SafetyTag;
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  { id: "openai-image", label: "OpenAI Image", kind: "image", safety: "sfw" },
  { id: "seedream", label: "Seedream", kind: "image", safety: "sfw" },
  { id: "nano-banana", label: "Nano Banana", kind: "image", safety: "sfw" },
  { id: "grok", label: "Grok Image", kind: "image", safety: "nsfw" },
  { id: "seedance", label: "Seedance", kind: "video", safety: "sfw" },
  { id: "higgsfield", label: "Higgsfield", kind: "video", safety: "sfw" },
  { id: "azure-speech", label: "Azure Speech", kind: "voice", safety: "sfw" },
];

export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((model) => model.id === id);
}

export function getModelsByKind(kind: ModelKind): ModelDefinition[] {
  return MODEL_REGISTRY.filter((model) => model.kind === kind);
}
