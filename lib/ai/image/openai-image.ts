import "server-only";

import type { AspectRatio } from "@/lib/ai/registry";
import {
  errorResult,
  getEnv,
  notConfiguredResult,
  successResult,
  type GenerationResult,
} from "@/lib/ai/shared";
import type { GenerateImageInput, ImageAdapter } from "./types";
import { persistGeneratedBuffer } from "@/lib/storage/persist-generated";

const OPENAI_API_BASE = "https://api.openai.com/v1";

type OpenAiImageSize = "1024x1536" | "1536x1024";

interface OpenAiImageData {
  b64_json?: string;
  url?: string;
}

interface OpenAiImageResponse {
  created?: number;
  data?: OpenAiImageData[];
  error?: { message?: string; type?: string; code?: string };
}

function openAiImageModel(): string {
  return getEnv("OPENAI_IMAGE_MODEL") ?? "gpt-image-2";
}

function openAiImageSize(aspectRatio: AspectRatio): OpenAiImageSize {
  return aspectRatio === "9:16" ? "1024x1536" : "1536x1024";
}

function parseDimensions(size: OpenAiImageSize): { width: number; height: number } {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

function clampCount(count: number): number {
  return Math.min(5, Math.max(1, count));
}

function parseOpenAiError(status: number, body: OpenAiImageResponse | string): string {
  const payload = typeof body === "string" ? { error: { message: body } } : body;
  const message = payload.error?.message ?? `OpenAI request failed (${status}).`;
  const code = payload.error?.code ?? payload.error?.type ?? "";

  if (status === 403) {
    if (/verif/i.test(message) || /organization/i.test(message)) {
      return `OpenAI Image: organization verification required — ${message}`;
    }
    return `OpenAI Image: access denied (403) — ${message}`;
  }

  if (status === 400 && (/moderat/i.test(message) || /safety/i.test(message) || /policy/i.test(message))) {
    return `OpenAI Image: content blocked by moderation — ${message}`;
  }

  if (code) {
    return `OpenAI Image (${status}, ${code}): ${message}`;
  }

  return `OpenAI Image (${status}): ${message}`;
}

async function readOpenAiResponse(response: Response): Promise<OpenAiImageResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as OpenAiImageResponse;
  } catch {
    return { error: { message: text.slice(0, 500) } };
  }
}

async function fetchReferenceImage(
  url: string,
  index: number,
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch identity-lock reference image (${response.status}).`);
  }

  const mimeType = response.headers.get("content-type") ?? "image/png";
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    filename: `reference-${index + 1}.${ext}`,
    mimeType,
  };
}

async function callOpenAiGenerations(input: {
  apiKey: string;
  model: string;
  prompt: string;
  size: OpenAiImageSize;
  count: number;
}): Promise<OpenAiImageResponse> {
  const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      n: input.count,
      size: input.size,
      quality: "high",
    }),
  });

  const body = await readOpenAiResponse(response);
  if (!response.ok) {
    throw new Error(parseOpenAiError(response.status, body));
  }

  return body;
}

async function callOpenAiEdits(input: {
  apiKey: string;
  model: string;
  prompt: string;
  size: OpenAiImageSize;
  count: number;
  referenceImages: { buffer: Buffer; filename: string; mimeType: string }[];
}): Promise<OpenAiImageResponse> {
  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("n", String(input.count));
  form.append("size", input.size);
  form.append("quality", "high");

  for (const image of input.referenceImages) {
    const blob = new Blob([Uint8Array.from(image.buffer)], { type: image.mimeType });
    form.append("image", blob, image.filename);
  }

  const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: form,
  });

  const body = await readOpenAiResponse(response);
  if (!response.ok) {
    throw new Error(parseOpenAiError(response.status, body));
  }

  return body;
}

function extractB64Images(response: OpenAiImageResponse): string[] {
  const images = (response.data ?? [])
    .map((item) => item.b64_json)
    .filter((value): value is string => Boolean(value));

  if (!images.length) {
    throw new Error("OpenAI Image: response contained no image data.");
  }

  return images;
}

async function uploadGeneratedImages(input: {
  sceneId: string;
  b64Images: string[];
  size: OpenAiImageSize;
}): Promise<GenerationResult> {
  const { width, height } = parseDimensions(input.size);
  const assetUrls: string[] = [];
  const persistedAssets: NonNullable<GenerationResult["persistedAssets"]> = [];

  for (const b64 of input.b64Images) {
    const buffer = Buffer.from(b64, "base64");
    const stored = await persistGeneratedBuffer({
      sceneId: input.sceneId,
      buffer,
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
    costEstimate: input.b64Images.length * 0.08,
  });
}

export const generateImage: ImageAdapter = async (input) => {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return notConfiguredResult("OpenAI Image", "OPENAI_API_KEY");
  }

  const model = openAiImageModel();
  const size = openAiImageSize(input.aspectRatio);
  const count = clampCount(input.count);

  try {
    const hasReferences = input.refImageUrls.length > 0;
    const referenceImages = hasReferences
      ? await Promise.all(input.refImageUrls.map((url, index) => fetchReferenceImage(url, index)))
      : [];

    const response = hasReferences
      ? await callOpenAiEdits({
          apiKey,
          model,
          prompt: input.prompt,
          size,
          count,
          referenceImages,
        })
      : await callOpenAiGenerations({
          apiKey,
          model,
          prompt: input.prompt,
          size,
          count,
        });

    const b64Images = extractB64Images(response);
    return await uploadGeneratedImages({ sceneId: input.sceneId, b64Images, size });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : "OpenAI Image generation failed.");
  }
};

export async function runOpenAiImage(input: GenerateImageInput): Promise<GenerationResult> {
  return generateImage(input);
}
