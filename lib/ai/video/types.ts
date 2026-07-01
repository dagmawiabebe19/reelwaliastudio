import type { AspectRatio } from "@/lib/ai/registry";
import type { GenerationResult } from "@/lib/ai/shared";

export type VideoReferenceImage = {
  label: string;
  bucket: string;
  storagePath: string;
  signedUrl?: string | null;
};

export interface GenerateVideoInput {
  prompt: string;
  referenceImages: VideoReferenceImage[];
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: string;
  sceneId: string;
  seedanceTier?: "standard" | "fast";
  seedanceAudioMode?: "off" | "full" | "ambient";
  /** fal runner hint — use take id for dashboard correlation + rescue. */
  providerHint?: string;
  onFalEnqueued?: (requestId: string, endpoint: string) => void | Promise<void>;
}

export type { GenerationResult };

export type VideoAdapter = (input: GenerateVideoInput) => Promise<GenerationResult>;
