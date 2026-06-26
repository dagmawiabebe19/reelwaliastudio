import "server-only";

import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

const notImplemented: ImageAdapter = async () => {
  throw new Error("grok adapter: not implemented — TODO wire Grok image API");
};

export const generateImage: ImageAdapter = notImplemented;

export async function runGrok(input: GenerateImageInput): Promise<GenerationResult> {
  void process.env.OPENAI_API_KEY;
  return generateImage(input);
}
