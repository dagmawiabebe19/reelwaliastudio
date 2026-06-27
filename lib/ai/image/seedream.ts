import "server-only";

import { getEnv, notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";
import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

export const generateImage: ImageAdapter = async (input) => {
  void input;
  if (!getEnv("FAL_KEY")) {
    return notConfiguredResult("Seedream", "FAL_KEY");
  }
  return pendingIntegrationResult("Seedream");
};

export async function runSeedream(input: GenerateImageInput): Promise<GenerationResult> {
  return generateImage(input);
}
