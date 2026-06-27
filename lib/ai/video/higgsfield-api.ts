import "server-only";

import { HiggsfieldClient } from "@higgsfield/client";
import { config as configureV2 } from "@higgsfield/client/v2";
import type { V2Response } from "@higgsfield/client/v2";
import { getEnv } from "@/lib/ai/shared";
import { DEFAULT_DOP_MODEL, DEFAULT_VIDEO_ENDPOINT } from "@/lib/ai/video/higgsfield-constants";

export { DEFAULT_DOP_MODEL, DEFAULT_VIDEO_ENDPOINT, DOP_MODEL_OPTIONS, type DopModelId } from "@/lib/ai/video/higgsfield-constants";

/** Default platform base — override with HIGGSFIELD_API_BASE if needed. */
const DEFAULT_API_BASE = "https://platform.higgsfield.ai";

export function higgsfieldApiBase(): string {
  return (getEnv("HIGGSFIELD_API_BASE") ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

export function higgsfieldVideoEndpoint(): string {
  return getEnv("HIGGSFIELD_VIDEO_ENDPOINT") ?? DEFAULT_VIDEO_ENDPOINT;
}

export function higgsfieldDopModel(override?: string | null): string {
  return override?.trim() || getEnv("HIGGSFIELD_VIDEO_MODEL") || DEFAULT_DOP_MODEL;
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
  credentials: string;
  endpoint: string;
  dopModel: string;
} {
  const credentials = higgsfieldCredentials();
  if (!credentials) {
    throw new Error("Higgsfield: HIGGSFIELD_API_KEY is not set.");
  }

  return {
    credentials,
    endpoint: higgsfieldVideoEndpoint(),
    dopModel: higgsfieldDopModel(),
  };
}

export function configureHiggsfieldSdk(credentials: string): void {
  const [apiKey, apiSecret] = credentials.split(":");
  configureV2({
    credentials,
    baseURL: higgsfieldApiBase(),
    apiKey,
    apiSecret,
  });
}

export function createHiggsfieldUploadClient(credentials: string): HiggsfieldClient {
  const [apiKey, apiSecret] = credentials.split(":");
  return new HiggsfieldClient({
    apiKey,
    apiSecret,
    baseURL: higgsfieldApiBase(),
  });
}

export function extractVideoUrl(response: V2Response): string | null {
  if (response.video?.url) return response.video.url;
  return null;
}

export function assertCompletedVideoResponse(response: V2Response): string {
  if (response.status === "nsfw") {
    throw new Error("Higgsfield: content blocked by moderation (nsfw).");
  }
  if (response.status === "failed") {
    throw new Error("Higgsfield video generation failed.");
  }
  if (response.status !== "completed") {
    throw new Error(`Higgsfield: unexpected job status "${response.status}".`);
  }

  const url = extractVideoUrl(response);
  if (!url) {
    throw new Error("Higgsfield: completed job did not include a video URL.");
  }
  return url;
}
