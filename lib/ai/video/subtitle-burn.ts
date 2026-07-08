import "server-only";

import { ApiError, fal } from "@fal-ai/client";
import { configureFalClient } from "@/lib/ai/video/seedance-api";
import type {
  FalQueueStatus,
  FalQueueStatusResponse,
} from "@/lib/ai/video/seedance-api";
import type { BurnInStyle } from "@/lib/captioning/burn-style";

/**
 * fal endpoint that burns provided subtitles into a video (open captions).
 * VEED renders styled, burned-in subtitles; passing `srt_content` skips
 * transcription and burns exactly our reviewed English cues.
 * Docs: https://fal.ai/models/veed/subtitles/api
 */
export const SUBTITLE_BURN_ENDPOINT = "veed/subtitles";

export type VeedSubtitleInput = {
  video_url: string;
  srt_content: string;
  preset: string;
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

export function buildVeedInput(params: {
  videoUrl: string;
  srtContent: string;
  style: BurnInStyle;
}): VeedSubtitleInput {
  return {
    video_url: params.videoUrl,
    srt_content: params.srtContent,
    preset: params.style.preset,
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
      position: input.customization.position,
      srt_bytes: input.srt_content.length,
      video_url_host: safeHost(input.video_url),
    }),
  );

  const { request_id: requestId } = await fal.queue.submit(SUBTITLE_BURN_ENDPOINT, {
    input,
  });

  await options?.onEnqueue?.(requestId);
  return requestId;
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

export type { FalQueueStatus };

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}
