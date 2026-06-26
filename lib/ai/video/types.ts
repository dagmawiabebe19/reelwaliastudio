import type { AspectRatio } from "@/lib/ai/registry";

export interface GenerateVideoInput {
  prompt: string;
  startImageUrl: string | null;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: string;
}

export interface GenerationResult {
  assetUrls: string[];
  providerJobId: string | null;
  costEstimate: number | null;
}

export type VideoAdapter = (input: GenerateVideoInput) => Promise<GenerationResult>;
