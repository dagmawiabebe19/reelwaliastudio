import "server-only";

import { getEnv, notConfiguredResult, pendingIntegrationResult } from "@/lib/ai/shared";
import type { GenerateVideoInput, GenerationResult, VideoAdapter } from "./types";

export const generateVideo: VideoAdapter = async (input) => {
  void input;
  if (!getEnv("HIGGSFIELD_API_KEY")) {
    return notConfiguredResult("Higgsfield", "HIGGSFIELD_API_KEY");
  }
  return pendingIntegrationResult("Higgsfield");
};

export async function runHiggsfield(input: GenerateVideoInput): Promise<GenerationResult> {
  return generateVideo(input);
}
