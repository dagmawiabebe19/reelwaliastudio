import "server-only";

import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

const notImplemented: ImageAdapter = async () => {
  throw new Error("seedream adapter: not implemented — TODO wire Seedream API");
};

export const generateImage: ImageAdapter = notImplemented;

export async function runSeedream(input: GenerateImageInput): Promise<GenerationResult> {
  void process.env.FAL_KEY;
  return generateImage(input);
}
