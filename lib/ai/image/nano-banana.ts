import "server-only";

import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

const notImplemented: ImageAdapter = async () => {
  throw new Error("nano-banana adapter: not implemented — TODO wire Nano Banana API");
};

export const generateImage: ImageAdapter = notImplemented;

export async function runNanoBanana(input: GenerateImageInput): Promise<GenerationResult> {
  void process.env.REPLICATE_API_TOKEN;
  return generateImage(input);
}
