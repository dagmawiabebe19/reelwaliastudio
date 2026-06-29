import type { AspectRatio } from "@/lib/ai/registry";
import type { GenerationResult } from "@/lib/ai/shared";

export interface GenerateVideoInput {
  prompt: string;
  startImageUrl: string | null;
  startImageBucket?: string | null;
  startImageStoragePath?: string | null;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: string;
  sceneId: string;
  dopModel?: string;
  motionId?: string | null;
  motionStrength?: number;
  seedanceTier?: "standard" | "fast";
  generateAudio?: boolean;
}

export type { GenerationResult };

export type VideoAdapter = (input: GenerateVideoInput) => Promise<GenerationResult>;
