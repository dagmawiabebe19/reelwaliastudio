import type { AspectRatio, SafetyTag } from "@/lib/ai/registry";
import type { GenerationResult } from "@/lib/ai/shared";

export interface GenerateImageInput {
  prompt: string;
  refImageUrls: string[];
  aspectRatio: AspectRatio;
  count: number;
  resolution: string;
  safety: SafetyTag;
  sceneId: string;
  abortSignal?: AbortSignal;
  onBillableWorkStarted?: () => void;
}

export type { GenerationResult };

export type ImageAdapter = (input: GenerateImageInput) => Promise<GenerationResult>;
