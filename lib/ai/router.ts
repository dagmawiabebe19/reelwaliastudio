import "server-only";

import { getModelById, isModelConfigured } from "@/lib/ai/registry";
import { runGrok } from "@/lib/ai/image/grok";
import { runNanoBanana } from "@/lib/ai/image/nano-banana";
import { runOpenAiImage } from "@/lib/ai/image/openai-image";
import { runSeedream } from "@/lib/ai/image/seedream";
import type { GenerateImageInput } from "@/lib/ai/image/types";
import { runHiggsfield } from "@/lib/ai/video/higgsfield";
import { runSeedance } from "@/lib/ai/video/seedance";
import type { GenerateVideoInput } from "@/lib/ai/video/types";
import { notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";

const IMAGE_RUNNERS: Record<string, (input: GenerateImageInput) => ReturnType<typeof runOpenAiImage>> = {
  "openai-image": runOpenAiImage,
  seedream: runSeedream,
  "nano-banana": runNanoBanana,
  grok: runGrok,
};

const VIDEO_RUNNERS: Record<string, (input: GenerateVideoInput) => ReturnType<typeof runSeedance>> = {
  seedance: runSeedance,
  higgsfield: runHiggsfield,
};

export async function runImageModel(modelId: string, input: GenerateImageInput) {
  const model = getModelById(modelId);
  if (!model || model.kind !== "image") {
    return { ...notConfiguredResult(modelId, "unknown"), configured: false };
  }
  if (!isModelConfigured(model)) {
    return notConfiguredResult(model.label, model.envKey);
  }
  const runner = IMAGE_RUNNERS[modelId];
  if (!runner) {
    return pendingIntegrationResult(model.label);
  }
  return runner(input);
}

export async function runVideoModel(modelId: string, input: GenerateVideoInput) {
  const model = getModelById(modelId);
  if (!model || model.kind !== "video") {
    return { ...notConfiguredResult(modelId, "unknown"), configured: false };
  }
  if (!isModelConfigured(model)) {
    return notConfiguredResult(model.label, model.envKey);
  }
  const runner = VIDEO_RUNNERS[modelId];
  if (!runner) {
    return pendingIntegrationResult(model.label);
  }
  return runner(input);
}
