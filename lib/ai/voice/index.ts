import "server-only";

import { notConfiguredResult } from "@/lib/ai/shared";
import type { GenerateVoiceInput } from "./types";
import type { GenerationResult } from "@/lib/ai/shared";

/**
 * Voice generation adapter — STUB.
 * Provider TBD. Do not fabricate API endpoints.
 */
export const generateVoice = async (input: GenerateVoiceInput): Promise<GenerationResult> => {
  void input;
  if (!process.env.AZURE_SPEECH_KEY?.trim()) {
    return {
      ...notConfiguredResult("Voice", "AZURE_SPEECH_KEY"),
      error: "Voice provider not configured — set AZURE_SPEECH_KEY when a provider is wired.",
    };
  }
  return {
    assetUrls: [],
    providerJobId: null,
    costEstimate: null,
    configured: Boolean(process.env.AZURE_SPEECH_KEY?.trim()),
    error: "Voice provider not configured — adapter is a stub (provider TBD).",
  };
};

export async function runVoiceGeneration(input: GenerateVoiceInput): Promise<GenerationResult> {
  return generateVoice(input);
}
