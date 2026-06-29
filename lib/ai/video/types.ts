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
  startImageUrl: string | null;
  startImageBucket?: string | null;
  startImageStoragePath?: string | null;
  /** Seedance reference-to-video: bound character sheet + location images (up to 9). */
  referenceImages?: VideoReferenceImage[];
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: string;
  sceneId: string;
  dopModel?: string;
  motionId?: string | null;
  motionStrength?: number;
  seedanceTier?: "standard" | "fast";
  seedanceAudioMode?: "off" | "full" | "ambient";
}

export type { GenerationResult };

export type VideoAdapter = (input: GenerateVideoInput) => Promise<GenerationResult>;
