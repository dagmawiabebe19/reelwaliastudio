import "server-only";

import { ApiError, ValidationError, fal } from "@fal-ai/client";
import { getEnv } from "@/lib/ai/shared";
import {
  DEFAULT_SEEDANCE_FAST_MODEL,
  DEFAULT_SEEDANCE_MODEL,
} from "@/lib/ai/video/seedance-constants";
import {
  formatSeedanceLikenessRejection,
  isSeedanceLikenessText,
} from "@/lib/ai/video/seedance-likeness";

export {
  formatSeedanceLikenessRejection,
  getLikenessRejectionDisplay,
  parseLikenessRejectionMessage,
} from "@/lib/ai/video/seedance-likeness";

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

/** True when a URL is hosted on fal's CDN/storage (stable for Seedance image_urls). */
export function isFalHostedStorageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("fal.media") || host.includes("fal.ai") || host.includes("fal.run");
  } catch {
    return false;
  }
}

function assertUsableFalUploadUrl(url: string | null | undefined, label: string): string {
  const trimmed = url?.trim();
  if (!trimmed) {
    throw new Error(`Seedance: fal upload for reference "${label}" returned an empty URL.`);
  }
  if (!isFalHostedStorageUrl(trimmed)) {
    throw new Error(
      `Seedance: fal upload for reference "${label}" did not return a fal-hosted URL (got ${trimmed}).`,
    );
  }
  return trimmed;
}

/** @deprecated Never pass third-party signed URLs to Seedance — always upload via fal.storage. */
export function isPublicFalImageUrl(url: string | null | undefined): boolean {
  return isFalHostedStorageUrl(url);
}

/** Upload image bytes via fal SDK storage — returns a stable fal-hosted URL. */
export async function uploadSeedanceSourceImage(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  configureFalClient();
  const ext = imageExtension(contentType);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: contentType || "image/jpeg",
  });
  const file = new File([blob], `reference.${ext}`, { type: blob.type });
  const url = await fal.storage.upload(file);
  return assertUsableFalUploadUrl(url, "uploaded image");
}

export type SeedanceReferenceUpload = {
  label: string;
  bucket: string;
  storagePath: string;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download from Supabase storage and upload to fal.storage for one reference.
 * Retries the fal upload once on transient failure.
 */
export async function uploadSeedanceReferenceImage(
  ref: SeedanceReferenceUpload,
  download: (
    source: Pick<SeedanceReferenceUpload, "bucket" | "storagePath">,
  ) => Promise<{ buffer: Buffer; contentType: string }>,
): Promise<string> {
  let buffer: Buffer;
  let contentType: string;
  try {
    const downloaded = await download({
      bucket: ref.bucket,
      storagePath: ref.storagePath,
    });
    buffer = downloaded.buffer;
    contentType = downloaded.contentType;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Seedance: could not read reference "${ref.label}" from storage (${ref.bucket}/${ref.storagePath}) — ${detail}`,
    );
  }

  if (!buffer.length) {
    throw new Error(`Seedance: reference "${ref.label}" has no image bytes in storage.`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = await uploadSeedanceSourceImage(buffer, contentType);
      return assertUsableFalUploadUrl(url, ref.label);
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await sleep(400);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Seedance: failed to upload reference "${ref.label}" to fal storage after retry — ${detail}`,
  );
}

/** Upload every bound reference to fal.storage; never pass Supabase signed URLs to Seedance. */
export async function uploadAllSeedanceReferenceImages(
  references: SeedanceReferenceUpload[],
  download: (
    source: Pick<SeedanceReferenceUpload, "bucket" | "storagePath">,
  ) => Promise<{ buffer: Buffer; contentType: string }>,
): Promise<string[]> {
  const image_urls: string[] = [];
  for (const ref of references) {
    image_urls.push(await uploadSeedanceReferenceImage(ref, download));
  }
  return image_urls;
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
    detail?: string | Array<{ msg?: string; loc?: unknown; type?: string }>;
    error?: string;
    message?: string;
  };

  if (typeof record.detail === "string") return record.detail;
  if (Array.isArray(record.detail)) {
    return record.detail
      .map((item) => {
        const loc = item.loc ? ` (${JSON.stringify(item.loc)})` : "";
        return [item.msg, loc].filter(Boolean).join("");
      })
      .filter(Boolean)
      .join("; ");
  }
  if (record.error) return record.error;
  if (record.message) return record.message;

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function fullApiErrorBody(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function falErrorText(error: unknown): string {
  if (error instanceof ApiError || error instanceof ValidationError) {
    return [formatApiErrorBody(error.body), error.message].filter(Boolean).join(" ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** fal/Seedance sometimes cannot fetch its own freshly-uploaded storage URL (transient 422). */
export function isTransientSeedanceReferenceDownloadError(error: unknown): boolean {
  if (!(error instanceof ApiError) && !(error instanceof ValidationError)) {
    return false;
  }
  if (error.status !== 422) return false;
  // Likeness/moderation 422s are deterministic — never treat as transient download failures.
  if (isSeedanceLikenessRejection(error)) return false;

  const haystack = falErrorText(error).toLowerCase();
  return (
    haystack.includes("failed to download") ||
    haystack.includes("download the file") ||
    haystack.includes("url is accessible")
  );
}

/**
 * Deterministic Seedance content moderation: reference flagged as a real-person likeness.
 * Do NOT auto-retry — retries burn attempts and never succeed.
 * Official fal Seedance reference-to-video schema has no consent/allow-likeness flag.
 */
export function isSeedanceLikenessRejection(error: unknown): boolean {
  return isSeedanceLikenessText(falErrorText(error));
}

export function formatSeedanceLikenessRejectionMessage(referenceLabels: string[]): string {
  return formatSeedanceLikenessRejection(referenceLabels);
}

export function formatFalError(error: unknown): string {
  if (error instanceof ValidationError) {
    const fields = error.fieldErrors.map((item) => item.msg).filter(Boolean).join("; ");
    const detail = fields || formatApiErrorBody(error.body) || error.message;
    const fullBody = fullApiErrorBody(error.body);
    const request = error.requestId ? ` [request ${error.requestId}]` : "";
    const bodySuffix =
      fullBody && fullBody !== detail ? ` Full response: ${fullBody}` : "";
    return `Seedance: (${error.status}) ${detail}${bodySuffix}${request}`;
  }

  if (error instanceof ApiError) {
    const detail = formatApiErrorBody(error.body) || error.message;
    const fullBody = fullApiErrorBody(error.body);
    const request = error.requestId ? ` [request ${error.requestId}]` : "";
    const bodySuffix =
      fullBody && fullBody !== detail ? ` Full response: ${fullBody}` : fullBody ? ` Full response: ${fullBody}` : "";
    return `Seedance: (${error.status}) ${detail}${bodySuffix}${request}`;
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
  options?: {
    onEnqueue?: (requestId: string) => void | Promise<void>;
    hint?: string;
  },
): Promise<SeedanceQueueResult> {
  configureFalClient();
  const endpoint = seedanceModelId(tier);

  console.log(
    "[seedance-submit]",
    JSON.stringify(
      {
        endpoint,
        image_urls: input.image_urls,
        image_url_hosts: input.image_urls.map((url) => {
          try {
            return new URL(url).hostname;
          } catch {
            return url;
          }
        }),
        reference_count: input.image_urls.length,
        hint: options?.hint ?? null,
      },
      null,
      2,
    ),
  );

  const { request_id: requestId } = await fal.queue.submit(endpoint, {
    input,
    hint: options?.hint,
  });

  console.log(
    "[seedance-enqueued]",
    JSON.stringify({ endpoint, requestId, hint: options?.hint ?? null }),
  );
  await options?.onEnqueue?.(requestId);

  await fal.queue.subscribeToStatus(endpoint, {
    requestId,
    logs: true,
    pollInterval: 2_000,
  });

  const result = await fal.queue.result(endpoint, { requestId });

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
    requestId: result.requestId ?? requestId ?? null,
    seed: data.seed ?? null,
  };
}

const SEEDANCE_SUBMIT_RETRY_BACKOFF_MS = [1000, 2000] as const;

export type SeedanceReferenceDownloadFn = (
  source: Pick<SeedanceReferenceUpload, "bucket" | "storagePath">,
) => Promise<{ buffer: Buffer; contentType: string }>;

function logSeedanceReferenceUpload(
  sceneId: string,
  references: SeedanceReferenceUpload[],
  image_urls: string[],
  submitAttempt: number,
): void {
  console.log(
    "[seedance-reference-upload]",
    JSON.stringify(
      {
        sceneId,
        submitAttempt,
        references: references.map((ref, index) => ({
          label: ref.label,
          falUrl: image_urls[index],
        })),
        image_urls,
      },
      null,
      2,
    ),
  );
}

/**
 * Upload all references to fal.storage and submit Seedance reference-to-video.
 * On transient 422 download-fetch failures, re-upload fresh URLs and retry (up to 2 retries).
 */
export async function submitSeedanceJobWithReferenceRetries(
  tier: string | null | undefined,
  options: {
    sceneId: string;
    references: SeedanceReferenceUpload[];
    download: SeedanceReferenceDownloadFn;
    falInput: Omit<SeedanceFalInput, "image_urls">;
    onEnqueue?: (requestId: string, endpoint: string) => void | Promise<void>;
    hint?: string;
  },
): Promise<SeedanceQueueResult> {
  const maxAttempts = 1 + SEEDANCE_SUBMIT_RETRY_BACKOFF_MS.length;
  let lastError: unknown;
  const endpoint = seedanceModelId(tier);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoffMs = SEEDANCE_SUBMIT_RETRY_BACKOFF_MS[attempt - 1];
      console.log(
        "[seedance-retry]",
        JSON.stringify({
          sceneId: options.sceneId,
          submitAttempt: attempt + 1,
          maxAttempts,
          reason: "transient_422_reference_download",
          backoffMs,
          previousError: lastError instanceof Error ? lastError.message : String(lastError),
        }),
      );
      await sleep(backoffMs);
    }

    const image_urls = await uploadAllSeedanceReferenceImages(
      options.references,
      options.download,
    );
    logSeedanceReferenceUpload(options.sceneId, options.references, image_urls, attempt + 1);

    try {
      return await submitSeedanceJob(tier, {
        ...options.falInput,
        image_urls,
      }, {
        hint: options.hint,
        onEnqueue: async (requestId) => {
          await options.onEnqueue?.(requestId, endpoint);
        },
      });
    } catch (error) {
      lastError = error;
      const canRetry =
        isTransientSeedanceReferenceDownloadError(error) && attempt < maxAttempts - 1;
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Seedance: reference-to-video submit failed after retries.");
}

export type FalQueueStatus =
  | "IN_QUEUE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | string;

export type FalQueueStatusResponse = {
  status: FalQueueStatus;
  error?: string | null;
  logs?: Array<{ message: string }>;
};

const SEEDANCE_ENDPOINT_CANDIDATES = [
  DEFAULT_SEEDANCE_FAST_MODEL,
  DEFAULT_SEEDANCE_MODEL,
] as const;

export function inferSeedanceEndpointsForTake(input: {
  providerEndpoint?: string | null;
  resolution?: string | null;
}): string[] {
  if (input.providerEndpoint?.trim()) {
    return [input.providerEndpoint.trim()];
  }
  // 480p is typically fast tier; 720p may be either — try both for rescue.
  if (input.resolution === "480p") {
    return [DEFAULT_SEEDANCE_FAST_MODEL];
  }
  return [...SEEDANCE_ENDPOINT_CANDIDATES];
}

export function extractRequestIdFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const match =
    text.match(/\[request\s+([0-9a-f-]{36})\]/i) ??
    text.match(/request[_\s-]?id[:\s]+([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export async function getSeedanceQueueStatus(
  endpoint: string,
  requestId: string,
): Promise<FalQueueStatusResponse> {
  configureFalClient();
  try {
    return (await fal.queue.status(endpoint, { requestId })) as FalQueueStatusResponse;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { status: "NOT_FOUND" };
    }
    throw error;
  }
}

export async function getSeedanceQueueResult(
  endpoint: string,
  requestId: string,
): Promise<SeedanceQueueResult> {
  configureFalClient();
  const result = await fal.queue.result(endpoint, { requestId });
  const data = result.data as SeedanceFalOutput;
  const videoUrl = data.video?.url;
  if (!videoUrl) {
    throw new ApiError({
      message: "Seedance job completed but no video URL in fal response.",
      status: 500,
      body: data,
      requestId,
    });
  }
  return {
    videoUrl,
    requestId,
    seed: data.seed ?? null,
  };
}

export async function waitForSeedanceQueueCompletion(
  endpoint: string,
  requestId: string,
  options?: { pollIntervalMs?: number },
): Promise<FalQueueStatusResponse> {
  configureFalClient();
  return (await fal.queue.subscribeToStatus(endpoint, {
    requestId,
    pollInterval: options?.pollIntervalMs ?? 2_000,
    logs: false,
  })) as FalQueueStatusResponse;
}

export type FalPlatformRequestRow = {
  request_id: string;
  endpoint_id: string;
  status?: string;
  status_code?: number;
  created_at?: string;
  sent_at?: string;
  started_at?: string;
  ended_at?: string;
};

function falRequestTimestamp(row: FalPlatformRequestRow): number {
  const raw = row.sent_at ?? row.started_at ?? row.created_at ?? row.ended_at;
  return raw ? new Date(raw).getTime() : 0;
}

/** List recent fal requests for gallery model endpoints (models API, not serverless). */
export async function listFalRequestsByEndpoint(input: {
  endpointId: string;
  start?: string;
  end?: string;
  limit?: number;
}): Promise<FalPlatformRequestRow[]> {
  const key = getEnv("FAL_KEY");
  if (!key) return [];

  const params = new URLSearchParams();
  params.set("endpoint_id", input.endpointId);
  params.set("limit", String(input.limit ?? 100));
  if (input.start) params.set("start", input.start);
  if (input.end) params.set("end", input.end);

  const response = await fetch(
    `https://api.fal.ai/v1/models/requests/by-endpoint?${params.toString()}`,
    {
      headers: { Authorization: `Key ${key}` },
    },
  );

  if (!response.ok) {
    console.warn("[fal-list-requests] unavailable", {
      endpointId: input.endpointId,
      status: response.status,
      body: await response.text().catch(() => ""),
    });
    return [];
  }

  const payload = (await response.json()) as { items?: FalPlatformRequestRow[] };
  return payload.items ?? [];
}

export function matchFalRequestsToTakes<T extends { id: string; created_at: string }>(
  takes: T[],
  requests: FalPlatformRequestRow[],
  maxDeltaMs = 5 * 60_000,
): Map<string, { requestId: string; endpoint: string }> {
  const sortedRequests = [...requests].sort(
    (a, b) => falRequestTimestamp(a) - falRequestTimestamp(b),
  );
  const sortedTakes = [...takes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const used = new Set<string>();
  const matches = new Map<string, { requestId: string; endpoint: string }>();

  for (const take of sortedTakes) {
    const takeTime = new Date(take.created_at).getTime();
    let best: FalPlatformRequestRow | null = null;
    let bestDelta = Infinity;

    for (const row of sortedRequests) {
      if (!row.request_id || used.has(row.request_id)) continue;
      const delta = Math.abs(falRequestTimestamp(row) - takeTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = row;
      }
    }

    if (best?.request_id && bestDelta <= maxDeltaMs) {
      used.add(best.request_id);
      matches.set(take.id, {
        requestId: best.request_id,
        endpoint: best.endpoint_id,
      });
    }
  }

  return matches;
}
