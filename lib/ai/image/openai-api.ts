import "server-only";

import { getEnv } from "@/lib/ai/shared";
import type { AspectRatio } from "@/lib/ai/registry";

const OPENAI_API_BASE = "https://api.openai.com/v1";

export type OpenAiImageSize = "1024x1536" | "1536x1024";

export interface OpenAiImageResponse {
  created?: number;
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string; type?: string; code?: string };
}

export function openAiImageModel(): string {
  return getEnv("OPENAI_IMAGE_MODEL") ?? "gpt-image-2";
}

export function openAiImageSize(aspectRatio: AspectRatio): OpenAiImageSize {
  return aspectRatio === "9:16" ? "1024x1536" : "1536x1024";
}

export function parseDimensions(size: OpenAiImageSize): { width: number; height: number } {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

export function parseOpenAiError(status: number, body: OpenAiImageResponse | string): string {
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

  if (code) return `OpenAI Image (${status}, ${code}): ${message}`;
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

export async function fetchReferenceImageBuffer(
  url: string,
  index: number,
): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference image (${response.status}).`);
  }
  const mimeType = response.headers.get("content-type") ?? "image/png";
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    filename: `reference-${index + 1}.${ext}`,
    mimeType,
  };
}

export async function openAiGenerateImages(input: {
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
  if (!response.ok) throw new Error(parseOpenAiError(response.status, body));
  return body;
}

export async function openAiEditImages(input: {
  apiKey: string;
  model: string;
  prompt: string;
  size: OpenAiImageSize;
  count: number;
  referenceUrls: string[];
}): Promise<OpenAiImageResponse> {
  const referenceImages = await Promise.all(
    input.referenceUrls.map((url, index) => fetchReferenceImageBuffer(url, index)),
  );

  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("n", String(input.count));
  form.append("size", input.size);
  form.append("quality", "high");

  const imageFieldName = referenceImages.length > 1 ? "image[]" : "image";

  for (const image of referenceImages) {
    const blob = new Blob([Uint8Array.from(image.buffer)], { type: image.mimeType });
    form.append(imageFieldName, blob, image.filename);
  }

  const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });

  const body = await readOpenAiResponse(response);
  if (!response.ok) throw new Error(parseOpenAiError(response.status, body));
  return body;
}

export function extractB64Images(response: OpenAiImageResponse): string[] {
  const images = (response.data ?? [])
    .map((item) => item.b64_json)
    .filter((value): value is string => Boolean(value));
  if (!images.length) throw new Error("OpenAI Image: response contained no image data.");
  return images;
}
