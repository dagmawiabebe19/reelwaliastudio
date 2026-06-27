import "server-only";

import { getEnv, notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";
import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

export const generateImage: ImageAdapter = async (input) => {
  void input;
  if (!getEnv("XAI_API_KEY")) {
    return notConfiguredResult("Grok Image", "XAI_API_KEY");
  }
  return pendingIntegrationResult("Grok Image");
};

export async function runGrok(input: GenerateImageInput): Promise<GenerationResult> {
  return generateImage(input);
}
