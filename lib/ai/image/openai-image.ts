import "server-only";

import type { GenerateImageInput, GenerationResult, ImageAdapter } from "./types";

const notImplemented: ImageAdapter = async () => {
  throw new Error("openai-image adapter: not implemented — TODO wire OpenAI Images API");
};

export const generateImage: ImageAdapter = notImplemented;

export async function runOpenAiImage(input: GenerateImageInput): Promise<GenerationResult> {
  void process.env.OPENAI_API_KEY;
  return generateImage(input);
}
