import type { AspectRatio, SafetyTag } from "@/lib/ai/registry";

export interface GenerateImageInput {
  prompt: string;
  refImageUrls: string[];
  aspectRatio: AspectRatio;
  count: number;
  resolution: string;
  safety: SafetyTag;
}

export interface GenerationResult {
  assetUrls: string[];
  providerJobId: string | null;
  costEstimate: number | null;
}

export type ImageAdapter = (input: GenerateImageInput) => Promise<GenerationResult>;
