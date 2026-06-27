import "server-only";

import { getEnv, notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";
import type { GenerateVideoInput, GenerationResult, VideoAdapter } from "./types";

export const generateVideo: VideoAdapter = async (input) => {
  void input;
  if (!getEnv("FAL_KEY")) {
    return notConfiguredResult("Seedance", "FAL_KEY");
  }
  return pendingIntegrationResult("Seedance");
};

export async function runSeedance(input: GenerateVideoInput): Promise<GenerationResult> {
  return generateVideo(input);
}
