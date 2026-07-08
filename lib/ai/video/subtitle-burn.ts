import "server-only";

import { ApiError, ValidationError, fal } from "@fal-ai/client";
import { configureFalClient, formatFalError } from "@/lib/ai/video/seedance-api";
import type {
  FalQueueStatus,
  FalQueueStatusResponse,
} from "@/lib/ai/video/seedance-api";
import type { BurnInStyle } from "@/lib/captioning/burn-style";

/**
 * fal endpoint that burns provided subtitles into a video (open captions).
 * VEED renders styled, burned-in subtitles; passing SRT skips transcription
 * and burns exactly our reviewed English cues.
 * Docs: https://fal.ai/models/veed/subtitles/api
 */
export const SUBTITLE_BURN_ENDPOINT = "veed/subtitles";

export type VeedSubtitleInput = {
  video_url: string;
  srt_file_url: string;
  preset: string;
  language: string;
  customization: {
    position: "top" | "center" | "bottom";
    shadow: "none" | "min" | "mid" | "max";
    text_customizations: {
      baseline: {
        font?: string;
        weight: number;
        color: string;
      };
    };
  };
};

/** Upload SRT text to fal.storage — VEED fetches a stable fal-hosted URL reliably. */
export async function uploadSrtToFal(srtContent: string): Promise<string> {
  configureFalClient();
  const blob = new Blob([srtContent], { type: "application/x-subrip" });
  const file = new File([blob], "captions.srt", { type: "application/x-subrip" });
  return fal.storage.upload(file);
}

export function buildVeedInput(params: {
  videoUrl: string;
  srtFileUrl: string;
  style: BurnInStyle;
}): VeedSubtitleInput {
  return {
    video_url: params.videoUrl,
    srt_file_url: params.srtFileUrl,
    preset: params.style.preset,
    language: "en-US",
    customization: {
      position: params.style.position,
      shadow: params.style.shadow,
      text_customizations: {
        baseline: {
          ...(params.style.font ? { font: params.style.font } : {}),
          weight: params.style.fontWeight,
          color: params.style.color,
        },
      },
    },
  };
}

type VeedOutput = { video?: { url?: string; content_type?: string } };

/** Submit the burn-in job; report the queued request id before we start polling. */
export async function submitSubtitleBurnJob(
  input: VeedSubtitleInput,
  options?: { onEnqueue?: (requestId: string) => void | Promise<void> },
): Promise<string> {
  configureFalClient();

  console.log(
    "[caption-burn-submit]",
    JSON.stringify({
      endpoint: SUBTITLE_BURN_ENDPOINT,
      preset: input.preset,
      language: input.language,
      position: input.customization.position,
      srt_file_url_host: safeHost(input.srt_file_url),
      video_url_host: safeHost(input.video_url),
    }),
  );

  try {
    const { request_id: requestId } = await fal.queue.submit(SUBTITLE_BURN_ENDPOINT, {
      input,
    });
    await options?.onEnqueue?.(requestId);
    return requestId;
  } catch (error) {
    throw new Error(formatFalError(error) || "veed/subtitles submit failed.");
  }
}

export async function getSubtitleBurnStatus(
  requestId: string,
): Promise<FalQueueStatusResponse> {
  configureFalClient();
  try {
    return (await fal.queue.status(SUBTITLE_BURN_ENDPOINT, {
      requestId,
    })) as FalQueueStatusResponse;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { status: "NOT_FOUND" };
    }
    throw error;
  }
}

export async function waitForSubtitleBurnCompletion(
  requestId: string,
  options?: { pollIntervalMs?: number },
): Promise<FalQueueStatusResponse> {
  configureFalClient();
  return (await fal.queue.subscribeToStatus(SUBTITLE_BURN_ENDPOINT, {
    requestId,
    pollInterval: options?.pollIntervalMs ?? 3_000,
    logs: false,
  })) as FalQueueStatusResponse;
}

/** Fetch the burned MP4 URL from a completed request. */
export async function getSubtitleBurnResultUrl(requestId: string): Promise<string> {
  configureFalClient();
  const result = await fal.queue.result(SUBTITLE_BURN_ENDPOINT, { requestId });
  const data = result.data as VeedOutput;
  const url = data.video?.url;
  if (!url) {
    throw new ApiError({
      message: "Subtitle burn completed but no video URL in fal response.",
      status: 500,
      body: data,
      requestId,
    });
  }
  return url;
}

export function formatVeedError(error: unknown): string {
  if (error instanceof ValidationError || error instanceof ApiError) {
    return formatFalError(error);
  }
  return error instanceof Error ? error.message : String(error);
}

export type { FalQueueStatus };

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}
