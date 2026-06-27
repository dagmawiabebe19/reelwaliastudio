import "server-only";

import { getEnv, notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";
import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

export const generateImage: ImageAdapter = async (input) => {
  void input;
  if (!getEnv("FAL_KEY")) {
    return notConfiguredResult("Nano Banana", "FAL_KEY");
  }
  return pendingIntegrationResult("Nano Banana");
};

export async function runNanoBanana(input: GenerateImageInput): Promise<GenerationResult> {
  return generateImage(input);
}
