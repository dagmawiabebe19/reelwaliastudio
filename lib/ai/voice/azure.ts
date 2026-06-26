import "server-only";

import type { GenerateVoiceInput, GenerationResult, VoiceAdapter } from "./types";

const notImplemented: VoiceAdapter = async () => {
  throw new Error("azure voice adapter: not implemented — TODO wire Azure Speech API");
};

export const generateVoice: VoiceAdapter = notImplemented;

export async function runAzureVoice(input: GenerateVoiceInput): Promise<GenerationResult> {
  void process.env.AZURE_SPEECH_KEY;
  void process.env.AZURE_SPEECH_REGION;
  return generateVoice(input);
}
