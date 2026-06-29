import "server-only";

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

const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_STORAGE_UPLOAD = "https://rest.alpha.fal.ai/storage/upload";
const FAL_POLL_INTERVAL_MS = 3_000;
const FAL_MAX_POLL_MS = 15 * 60 * 1_000;

export function falCredentialsConfigured(): boolean {
  return Boolean(getEnv("FAL_KEY"));
}

function falAuthHeaders(): Record<string, string> {
  const key = getEnv("FAL_KEY");
  if (!key) {
    throw new Error("Seedance: FAL_KEY is not configured.");
  }
  return { Authorization: `Key ${key}` };
}

function imageExtension(contentType: string): string {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  return "jpg";
}

function queueUrl(modelId: string, suffix = ""): string {
  const path = suffix ? `/${modelId}/requests/${suffix}` : `/${modelId}`;
  return `${FAL_QUEUE_BASE}${path}`;
}

async function readFalError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      detail?: string | Array<{ msg?: string; loc?: string[] }>;
      error?: string;
      message?: string;
    };
    if (typeof json.detail === "string") return json.detail;
    if (Array.isArray(json.detail)) {
      return json.detail.map((item) => item.msg).filter(Boolean).join("; ");
    }
    if (json.error) return json.error;
    if (json.message) return json.message;
  } catch {
    // fall through
  }
  return text || `HTTP ${response.status}`;
}

/** Upload source take bytes to fal CDN — avoids expiring Supabase signed URLs. */
export async function uploadSeedanceSourceImage(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const ext = imageExtension(contentType);
  const filename = `source.${ext}`;
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: contentType || "image/jpeg" }),
    filename,
  );

  const response = await fetch(FAL_STORAGE_UPLOAD, {
    method: "POST",
    headers: falAuthHeaders(),
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `Seedance: fal storage upload failed (${response.status}): ${await readFalError(response)}`,
    );
  }

  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error("Seedance: fal storage upload returned no URL.");
  }

  return payload.url;
}

export type SeedanceQueueResult = {
  videoUrl: string;
  requestId: string | null;
  seed: number | null;
};

export type SeedanceFalInput = {
  prompt: string;
  image_url: string;
  resolution: "480p" | "720p";
  duration: string;
  aspect_ratio: "9:16" | "16:9";
  generate_audio: boolean;
};

type FalQueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

async function submitFalQueue(modelId: string, input: SeedanceFalInput): Promise<string> {
  const response = await fetch(queueUrl(modelId), {
    method: "POST",
    headers: {
      ...falAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(
      `Seedance: submit failed (${response.status}): ${await readFalError(response)}`,
    );
  }

  const payload = (await response.json()) as { request_id?: string };
  if (!payload.request_id) {
    throw new Error("Seedance: fal queue submit returned no request_id.");
  }

  return payload.request_id;
}

async function pollFalQueueToTerminal(
  modelId: string,
  requestId: string,
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < FAL_MAX_POLL_MS) {
    const response = await fetch(queueUrl(modelId, `${requestId}/status`), {
      headers: falAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Seedance: status poll failed (${response.status}): ${await readFalError(response)}`,
      );
    }

    const statusPayload = (await response.json()) as {
      status?: FalQueueStatus;
      error?: string;
    };

    if (statusPayload.status === "COMPLETED") return;

    if (statusPayload.status === "FAILED") {
      throw new Error(
        statusPayload.error
          ? `Seedance: job failed — ${statusPayload.error}`
          : "Seedance: job failed.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, FAL_POLL_INTERVAL_MS));
  }

  throw new Error("Seedance: timed out waiting for fal job to complete.");
}

async function fetchFalQueueResult(
  modelId: string,
  requestId: string,
): Promise<{ videoUrl: string; seed: number | null }> {
  const response = await fetch(queueUrl(modelId, requestId), {
    headers: falAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Seedance: result fetch failed (${response.status}): ${await readFalError(response)}`,
    );
  }

  const payload = (await response.json()) as {
    video?: { url?: string };
    seed?: number;
  };

  const videoUrl = payload.video?.url;
  if (!videoUrl) {
    throw new Error("Seedance: job completed but no video URL in fal response.");
  }

  return { videoUrl, seed: payload.seed ?? null };
}

export async function submitSeedanceJob(
  tier: string | null | undefined,
  input: SeedanceFalInput,
): Promise<SeedanceQueueResult> {
  const endpoint = seedanceModelId(tier);
  const requestId = await submitFalQueue(endpoint, input);
  await pollFalQueueToTerminal(endpoint, requestId);
  const { videoUrl, seed } = await fetchFalQueueResult(endpoint, requestId);

  return {
    videoUrl,
    requestId,
    seed,
  };
}

export function formatFalError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.startsWith("Seedance:")
      ? error.message
      : `Seedance: ${error.message}`;
  }

  return `Seedance: ${String(error)}`;
}
