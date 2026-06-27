import "server-only";

import { getEnv } from "@/lib/ai/shared";
import type { AspectRatio } from "@/lib/ai/registry";

/** Default platform base — override with HIGGSFIELD_API_BASE if needed. */
const DEFAULT_API_BASE = "https://platform.higgsfield.ai";

/** Poll interval while waiting for async video jobs (ms). */
const POLL_INTERVAL_MS = 2_000;
/** Max wait before timing out a video job (ms). */
const MAX_POLL_MS = 300_000;

export interface HiggsfieldSubmitResponse {
  request_id?: string;
  status?: string;
  status_url?: string;
  cancel_url?: string;
  error?: string;
  message?: string;
}

export interface HiggsfieldStatusResponse {
  status?: string;
  request_id?: string;
  status_url?: string;
  video?: { url?: string };
  videos?: Array<{ url?: string }>;
  images?: Array<{ url?: string }>;
  jobs?: Array<{ results?: { raw?: { url?: string }; min?: { url?: string } } }>;
  error?: string;
  message?: string;
}

export function higgsfieldApiBase(): string {
  return (getEnv("HIGGSFIELD_API_BASE") ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

/**
 * Relative submit path for the Seedance image-to-video model.
 * TODO: Set HIGGSFIELD_VIDEO_MODEL to your Higgsfield endpoint path
 * (e.g. bytedance/seedance/v1/lite/image-to-video).
 */
export function higgsfieldVideoModelPath(): string | null {
  const value = getEnv("HIGGSFIELD_VIDEO_MODEL");
  return value || null;
}

export function higgsfieldCredentials(): string | null {
  const apiKey = getEnv("HIGGSFIELD_API_KEY");
  if (!apiKey) return null;

  if (apiKey.includes(":")) return apiKey;

  const secret = getEnv("HIGGSFIELD_API_SECRET");
  if (secret) return `${apiKey}:${secret}`;

  return apiKey;
}

export function assertHiggsfieldVideoConfig(): {
  apiBase: string;
  modelPath: string;
  credentials: string;
} {
  const credentials = higgsfieldCredentials();
  if (!credentials) {
    throw new Error("Higgsfield: HIGGSFIELD_API_KEY is not set.");
  }

  const modelPath = higgsfieldVideoModelPath();
  if (!modelPath) {
    throw new Error(
      "Higgsfield: HIGGSFIELD_VIDEO_MODEL is not set — add your Seedance image-to-video endpoint path from the Higgsfield dashboard.",
    );
  }

  return { apiBase: higgsfieldApiBase(), modelPath, credentials };
}

export function higgsfieldResolution(resolution: string): string {
  if (resolution === "480p") return "480";
  if (resolution === "720p") return "720";
  const digits = resolution.replace(/\D/g, "");
  return digits || "720";
}

export function parseHiggsfieldError(status: number, body: unknown): string {
  const payload =
    typeof body === "string"
      ? { message: body.slice(0, 500) }
      : (body as { error?: string; message?: string });

  const message = payload.error ?? payload.message ?? `Higgsfield request failed (${status}).`;
  return `Higgsfield (${status}): ${message}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function authHeaders(credentials: string): HeadersInit {
  return {
    Authorization: `Key ${credentials}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function buildSubmitUrl(apiBase: string, modelPath: string): string {
  const path = modelPath.startsWith("/") ? modelPath : `/${modelPath}`;
  return `${apiBase}${path}`;
}

function buildStatusUrl(apiBase: string, submit: HiggsfieldSubmitResponse): string {
  if (submit.status_url) return submit.status_url;
  if (submit.request_id) return `${apiBase}/requests/${submit.request_id}/status`;
  throw new Error("Higgsfield: submit response missing request_id and status_url.");
}

export function extractVideoUrl(status: HiggsfieldStatusResponse): string | null {
  if (status.video?.url) return status.video.url;

  const fromVideos = status.videos?.find((item) => item.url)?.url;
  if (fromVideos) return fromVideos;

  const fromJob = status.jobs?.find((job) => job.results?.raw?.url)?.results?.raw?.url;
  if (fromJob) return fromJob;

  return null;
}

export async function higgsfieldSubmitVideoJob(input: {
  credentials: string;
  apiBase: string;
  modelPath: string;
  prompt: string;
  imageUrl: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  resolution: string;
}): Promise<HiggsfieldSubmitResponse> {
  const response = await fetch(buildSubmitUrl(input.apiBase, input.modelPath), {
    method: "POST",
    headers: authHeaders(input.credentials),
    body: JSON.stringify({
      prompt: input.prompt,
      image_url: input.imageUrl,
      duration: input.durationSeconds,
      resolution: higgsfieldResolution(input.resolution),
      aspect_ratio: input.aspectRatio,
    }),
  });

  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(parseHiggsfieldError(response.status, body));
  }

  return body as HiggsfieldSubmitResponse;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function higgsfieldPollVideoJob(input: {
  credentials: string;
  apiBase: string;
  submit: HiggsfieldSubmitResponse;
  onPoll?: (status: string) => void;
}): Promise<HiggsfieldStatusResponse> {
  const statusUrl = buildStatusUrl(input.apiBase, input.submit);
  const started = Date.now();

  while (Date.now() - started < MAX_POLL_MS) {
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: authHeaders(input.credentials),
    });

    const body = (await readJson(response)) as HiggsfieldStatusResponse;
    if (!response.ok) {
      throw new Error(parseHiggsfieldError(response.status, body));
    }

    const status = (body.status ?? "unknown").toLowerCase();
    input.onPoll?.(status);

    if (status === "completed") return body;
    if (status === "failed") {
      throw new Error(body.error ?? body.message ?? "Higgsfield video generation failed.");
    }
    if (status === "nsfw") {
      throw new Error("Higgsfield: content blocked by moderation (nsfw).");
    }
    if (status === "canceled" || status === "cancelled") {
      throw new Error("Higgsfield: video generation was canceled.");
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Higgsfield: video generation timed out while polling for completion.");
}
