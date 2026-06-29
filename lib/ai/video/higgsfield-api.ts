import "server-only";

import { HiggsfieldClient, JobSet } from "@higgsfield/client";
import type { Job, JobSetData } from "@higgsfield/client";
import { config as configureV2 } from "@higgsfield/client/v2";
import { getEnv } from "@/lib/ai/shared";
import { DEFAULT_DOP_MODEL, DEFAULT_VIDEO_ENDPOINT } from "@/lib/ai/video/higgsfield-constants";

export { DEFAULT_DOP_MODEL, DEFAULT_VIDEO_ENDPOINT, DOP_MODEL_OPTIONS, type DopModelId } from "@/lib/ai/video/higgsfield-constants";

/** Default platform base — override with HIGGSFIELD_API_BASE if needed. */
const DEFAULT_API_BASE = "https://platform.higgsfield.ai";

type CredentialSource =
  | "HIGGSFIELD_API_KEY (combined)"
  | "HF_CREDENTIALS"
  | "HF_KEY"
  | "HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET"
  | "HF_API_KEY + HF_API_SECRET";

function normalizeEnvValue(raw: string | undefined): string | null {
  if (raw == null) return null;
  let value = raw.trim();
  if (!value) return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || null;
}

function readEnv(key: string): string | null {
  return normalizeEnvValue(process.env[key]);
}

function splitCredentialPair(value: string): { apiKey: string; apiSecret: string } {
  const idx = value.indexOf(":");
  return {
    apiKey: value.slice(0, idx),
    apiSecret: value.slice(idx + 1),
  };
}

function validateCredentialString(value: string, source: CredentialSource): string {
  const idx = value.indexOf(":");
  if (idx <= 0) {
    throw new Error(
      `Higgsfield: ${source} is present but has no ':' separator — needs KEY_ID:KEY_SECRET format.`,
    );
  }

  const { apiKey, apiSecret } = splitCredentialPair(value);
  if (!apiKey.trim()) {
    throw new Error(`Higgsfield: ${source} has an empty KEY_ID before ':'.`);
  }
  if (!apiSecret.trim()) {
    throw new Error(`Higgsfield: ${source} has an empty KEY_SECRET after ':'.`);
  }

  return `${apiKey.trim()}:${apiSecret.trim()}`;
}

function resolveRawCredentials(): { value: string; source: CredentialSource } | null {
  const higgsfieldApiKey = readEnv("HIGGSFIELD_API_KEY");
  if (higgsfieldApiKey?.includes(":")) {
    return { value: higgsfieldApiKey, source: "HIGGSFIELD_API_KEY (combined)" };
  }

  const hfCredentials = readEnv("HF_CREDENTIALS");
  if (hfCredentials) {
    return { value: hfCredentials, source: "HF_CREDENTIALS" };
  }

  const hfKey = readEnv("HF_KEY");
  if (hfKey) {
    return { value: hfKey, source: "HF_KEY" };
  }

  const higgsfieldSecret = readEnv("HIGGSFIELD_API_SECRET");
  if (higgsfieldApiKey && higgsfieldSecret) {
    return {
      value: `${higgsfieldApiKey}:${higgsfieldSecret}`,
      source: "HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET",
    };
  }

  const hfApiKey = readEnv("HF_API_KEY");
  const hfApiSecret = readEnv("HF_API_SECRET");
  if (hfApiKey && hfApiSecret) {
    return {
      value: `${hfApiKey}:${hfApiSecret}`,
      source: "HF_API_KEY + HF_API_SECRET",
    };
  }

  return null;
}

/** True when any supported Higgsfield credential env var is set. */
export function higgsfieldCredentialsConfigured(): boolean {
  return resolveRawCredentials() !== null;
}

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
  const resolved = resolveRawCredentials();
  if (!resolved) return null;
  return validateCredentialString(resolved.value, resolved.source);
}

export function assertHiggsfieldVideoConfig(): {
  credentials: string;
  endpoint: string;
  dopModel: string;
} {
  const resolved = resolveRawCredentials();
  if (!resolved) {
    throw new Error(
      "Higgsfield: no credentials found — set HIGGSFIELD_API_KEY (KEY_ID:KEY_SECRET), HF_CREDENTIALS, HF_KEY, or an API key + secret pair.",
    );
  }

  const credentials = validateCredentialString(resolved.value, resolved.source);

  return {
    credentials,
    endpoint: higgsfieldVideoEndpoint(),
    dopModel: higgsfieldDopModel(),
  };
}

export function configureHiggsfieldSdk(credentials: string): void {
  const { apiKey, apiSecret } = splitCredentialPair(credentials);
  configureV2({
    apiKey,
    apiSecret,
    baseURL: higgsfieldApiBase(),
  });
}

export function createHiggsfieldUploadClient(credentials: string): HiggsfieldClient {
  const { apiKey, apiSecret } = splitCredentialPair(credentials);
  return new HiggsfieldClient({
    apiKey,
    apiSecret,
    baseURL: higgsfieldApiBase(),
  });
}

/** Normalize v2 subscribe() payload (JobSet JSON or flat V2 status response) to JobSet. */
export function normalizeHiggsfieldJobResult(raw: unknown): JobSet {
  if (raw instanceof JobSet) return raw;

  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.jobs)) {
    return new JobSet({
      id: String(data.id ?? data.request_id ?? (data.jobs[0] as Job | undefined)?.id ?? ""),
      jobs: data.jobs as JobSetData["jobs"],
    });
  }

  const status = typeof data.status === "string" ? data.status : undefined;
  const requestId = typeof data.request_id === "string" ? data.request_id : undefined;
  if (requestId && status) {
    let results: Job["results"] = null;
    const video = data.video as { url?: string } | undefined;
    if (video?.url) {
      results = {
        raw: { url: video.url, type: "video" },
        min: { url: video.url, type: "video" },
      };
    } else {
      const images = data.images as Array<{ url?: string }> | undefined;
      const imageUrl = images?.[0]?.url;
      if (imageUrl) {
        results = {
          raw: { url: imageUrl, type: "image" },
          min: { url: imageUrl, type: "image" },
        };
      }
    }

    return new JobSet({
      id: requestId,
      jobs: [{ id: requestId, status, results }],
    });
  }

  throw new Error("Higgsfield: unrecognized job response shape.");
}

export function assertCompletedHiggsfieldJobSet(jobSet: JobSet): {
  videoUrl: string;
  jobSetId: string;
} {
  if (jobSet.isNsfw) {
    throw new Error("Higgsfield: content blocked by moderation (nsfw).");
  }
  if (jobSet.isFailed) {
    throw new Error("Higgsfield video generation failed.");
  }
  if (jobSet.isCanceled) {
    throw new Error("Higgsfield: video generation was canceled.");
  }
  if (!jobSet.isCompleted) {
    const jobStatus = jobSet.jobs[0]?.status ?? "unknown";
    throw new Error(`Higgsfield: job did not complete (status: ${jobStatus}).`);
  }

  const videoUrl = jobSet.jobs[0]?.results?.raw?.url;
  if (!videoUrl) {
    throw new Error("Higgsfield: completed job did not include a video URL.");
  }

  return { videoUrl, jobSetId: jobSet.id };
}
