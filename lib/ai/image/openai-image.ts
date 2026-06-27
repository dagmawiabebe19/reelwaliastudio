import "server-only";

import { getEnv, notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";
import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

export const generateImage: ImageAdapter = async (input) => {
  void input;
  if (!getEnv("OPENAI_API_KEY")) {
    return notConfiguredResult("OpenAI Image", "OPENAI_API_KEY");
  }
  return pendingIntegrationResult("OpenAI Image");
};

export async function runOpenAiImage(input: GenerateImageInput): Promise<GenerationResult> {
  return generateImage(input);
}
