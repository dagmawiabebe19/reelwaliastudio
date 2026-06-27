import type { AspectRatio } from "@/lib/ai/registry";
import type { GenerationResult } from "@/lib/ai/shared";

export interface GenerateVideoInput {
  prompt: string;
  startImageUrl: string | null;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: string;
}

export type { GenerationResult };

export type VideoAdapter = (input: GenerateVideoInput) => Promise<GenerationResult>;
