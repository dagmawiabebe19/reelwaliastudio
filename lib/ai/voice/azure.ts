import "server-only";

import { notConfiguredResult, pendingIntegrationResult, getEnv } from "@/lib/ai/shared";
import type { GenerateVoiceInput, GenerationResult, VoiceAdapter } from "./types";

export const generateVoice: VoiceAdapter = async (input) => {
  void input;
  if (!getEnv("AZURE_SPEECH_KEY")) {
    return notConfiguredResult("Azure Speech", "AZURE_SPEECH_KEY");
  }
  return {
    ...pendingIntegrationResult("Azure Speech"),
    error: "Voice provider not configured — Azure Speech adapter is a stub (provider TBD).",
  };
};

export async function runAzureVoice(input: GenerateVoiceInput): Promise<GenerationResult> {
  return generateVoice(input);
}
