import "server-only";

import { ApiError, ValidationError, fal } from "@fal-ai/client";
import { getEnv } from "@/lib/ai/shared";
import {
  DEFAULT_SEEDANCE_FAST_MODEL,
  DEFAULT_SEEDANCE_MODEL,
} from "@/lib/ai/video/seedance-constants";

export {
  DEFAULT_SEEDANCE_FAST_MODEL,
  DEFAULT_SEEDANCE_MODEL,
  SEEDANCE_DURATION_OPTIONS,
  SEEDANCE_TIER_OPTIONS,
  type SeedanceDurationSeconds,
  type SeedanceTierId,
} from "@/lib/ai/video/seedance-constants";

export function seedanceModelId(tier?: string | null): string {
  if (tier === "fast") {
    return getEnv("SEEDANCE_FAST_MODEL") ?? DEFAULT_SEEDANCE_FAST_MODEL;
  }
  return getEnv("SEEDANCE_MODEL") ?? DEFAULT_SEEDANCE_MODEL;
}

export function falCredentialsConfigured(): boolean {
  return Boolean(getEnv("FAL_KEY"));
}

export function configureFalClient(): void {
  const key = getEnv("FAL_KEY");
  if (!key) {
    throw new Error("Seedance: FAL_KEY is not configured.");
  }
  fal.config({ credentials: key });
}

function imageExtension(contentType: string): string {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  return "jpg";
}

/** True when fal can fetch the URL directly (not a private/expiring Supabase signed URL). */
export function isPublicFalImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host.includes("supabase")) return false;
    if (parsed.searchParams.has("token")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Upload source take bytes via fal SDK storage — avoids stale hand-rolled REST endpoints. */
export async function uploadSeedanceSourceImage(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  configureFalClient();
  const ext = imageExtension(contentType);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: contentType || "image/jpeg",
  });
  const file = new File([blob], `source.${ext}`, { type: blob.type });
  return fal.storage.upload(file);
}

export type SeedanceQueueResult = {
  videoUrl: string;
  requestId: string | null;
  seed: number | null;
};

export type SeedanceFalInput = {
  prompt: string;
  image_urls: string[];
  resolution: "480p" | "720p";
  duration: string;
  aspect_ratio: "9:16" | "16:9";
  generate_audio: boolean;
};

/** fal Seedance expects @Image1, @Image2, … in the prompt for each image_urls entry. */
export function buildSeedancePromptWithImageRefs(prompt: string, labels: string[]): string {
  if (!labels.length) return prompt;
  const refClause = labels
    .map((label, index) => `@Image${index + 1} for ${label}`)
    .join("; ");
  return `${refClause}. ${prompt}`;
}

type SeedanceFalOutput = {
  video?: { url?: string };
  seed?: number;
};

function formatApiErrorBody(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body !== "object") return String(body);

  const record = body as {
    detail?: string | Array<{ msg?: string }>;
    error?: string;
    message?: string;
  };

  if (typeof record.detail === "string") return record.detail;
  if (Array.isArray(record.detail)) {
    return record.detail.map((item) => item.msg).filter(Boolean).join("; ");
  }
  if (record.error) return record.error;
  if (record.message) return record.message;

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export function formatFalError(error: unknown): string {
  if (error instanceof ValidationError) {
    const fields = error.fieldErrors.map((item) => item.msg).filter(Boolean).join("; ");
    const detail = fields || formatApiErrorBody(error.body) || error.message;
    const request = error.requestId ? ` [request ${error.requestId}]` : "";
    return `Seedance: (${error.status}) ${detail}${request}`;
  }

  if (error instanceof ApiError) {
    const detail = formatApiErrorBody(error.body) || error.message;
    const request = error.requestId ? ` [request ${error.requestId}]` : "";
    return `Seedance: (${error.status}) ${detail}${request}`;
  }

  if (error instanceof Error) {
    return error.message.startsWith("Seedance:")
      ? error.message
      : `Seedance: ${error.message}`;
  }

  return `Seedance: ${String(error)}`;
}

export async function submitSeedanceJob(
  tier: string | null | undefined,
  input: SeedanceFalInput,
): Promise<SeedanceQueueResult> {
  configureFalClient();
  const endpoint = seedanceModelId(tier);

  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
  });

  const data = result.data as SeedanceFalOutput;
  const videoUrl = data.video?.url;
  if (!videoUrl) {
    throw new ApiError({
      message: "Seedance job completed but no video URL in fal response.",
      status: 500,
      body: data,
      requestId: result.requestId,
    });
  }

  return {
    videoUrl,
    requestId: result.requestId ?? null,
    seed: data.seed ?? null,
  };
}
