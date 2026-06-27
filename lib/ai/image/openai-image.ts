import "server-only";

import {
  errorResult,
  getEnv,
  notConfiguredResult,
  successResult,
  type GenerationResult,
} from "@/lib/ai/shared";
import {
  extractB64Images,
  openAiEditImages,
  openAiGenerateImages,
  openAiImageModel,
  openAiImageSize,
  parseDimensions,
} from "@/lib/ai/image/openai-api";
import type { GenerateImageInput, ImageAdapter } from "./types";
import { persistGeneratedBuffer } from "@/lib/storage/persist-generated";

export const generateImage: ImageAdapter = async (input) => {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return notConfiguredResult("OpenAI Image", "OPENAI_API_KEY");
  }

  const model = openAiImageModel();
  const size = openAiImageSize(input.aspectRatio);
  const count = Math.min(5, Math.max(1, input.count));

  try {
    const response =
      input.refImageUrls.length > 0
        ? await openAiEditImages({
            apiKey,
            model,
            prompt: input.prompt,
            size,
            count,
            referenceUrls: input.refImageUrls,
          })
        : await openAiGenerateImages({
            apiKey,
            model,
            prompt: input.prompt,
            size,
            count,
          });

    const b64Images = extractB64Images(response);
    const { width, height } = parseDimensions(size);
    const assetUrls: string[] = [];
    const persistedAssets: NonNullable<GenerationResult["persistedAssets"]> = [];

    for (const b64 of b64Images) {
      const stored = await persistGeneratedBuffer({
        sceneId: input.sceneId,
        buffer: Buffer.from(b64, "base64"),
        contentType: "image/png",
        width,
        height,
      });
      assetUrls.push(stored.signedUrl);
      persistedAssets.push({
        bucket: stored.bucket,
        storagePath: stored.storagePath,
        mediaType: stored.mediaType,
        width,
        height,
      });
    }

    return successResult({
      assetUrls,
      persistedAssets,
      providerJobId: `openai-${Date.now()}`,
      costEstimate: b64Images.length * 0.08,
    });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "OpenAI Image generation failed.");
  }
};

export async function runOpenAiImage(input: GenerateImageInput): Promise<GenerationResult> {
  return generateImage(input);
}
