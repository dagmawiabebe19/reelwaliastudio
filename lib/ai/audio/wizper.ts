import "server-only";

import { ApiError, fal } from "@fal-ai/client";
import { configureFalClient } from "@/lib/ai/video/seedance-api";
import type { WhisperSegment } from "@/lib/captioning/types";

/**
 * fal Wizper — Whisper v3 Large speech-to-text on fal's compute.
 * Accepts a media URL directly (mp3/mp4/mpeg/m4a/wav/webm), so we send the
 * uploaded episode video URL and skip audio extraction entirely. This avoids
 * running ffmpeg on Vercel (impossible) and OpenAI Whisper's 25 MB file cap.
 * Docs: https://fal.ai/models/fal-ai/wizper/api
 */
export const WIZPER_ENDPOINT = "fal-ai/wizper";

type WizperChunk = {
  timestamp?: [number | null, number | null] | number[];
  text?: string;
};

export type WizperOutput = {
  text?: string;
  chunks?: WizperChunk[];
  languages?: string[];
};

export interface WizperTranscription {
  segments: WhisperSegment[];
  durationSeconds: number;
  text: string;
  requestId: string;
  rawResponse: WizperOutput;
}

/**
 * Thrown when Wizper completes without usable speech chunks. Transient fal
 * failures (balance lock, bad demux) often surface this way — callers should
 * mark the job failed and allow retry rather than "transcribed / 0 cues".
 */
export class WizperEmptyResultError extends Error {
  readonly name = "WizperEmptyResultError";

  constructor(
    message: string,
    readonly requestId: string,
    readonly rawResponse: WizperOutput,
    readonly inputSummary: Record<string, unknown>,
  ) {
    super(message);
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

/** Map Wizper's timestamped chunks into our segment shape (seconds). */
function chunksToSegments(chunks: WizperChunk[]): WhisperSegment[] {
  const segments: WhisperSegment[] = [];

  for (const chunk of chunks) {
    const text = (chunk.text ?? "").trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;

    const ts = chunk.timestamp ?? [];
    const rawStart = ts[0];
    const rawEnd = ts[1];

    // Require Wizper's explicit speech timestamps — never invent a start at 0
    // (or the previous cue's end) when fal omits the start time.
    if (typeof rawStart !== "number" || typeof rawEnd !== "number") {
      console.warn("[wizper] skipping chunk with incomplete timestamps", { text, ts });
      continue;
    }

    const start = rawStart;
    const end = Math.max(start + 0.2, rawEnd);
    segments.push({ start, end, text });
  }

  return segments;
}

/**
 * Transcribe a media URL with fal Wizper. Submits to the queue, waits for
 * completion, and returns timestamped English segments.
 *
 * Throws {@link WizperEmptyResultError} when Wizper returns zero usable chunks
 * (default: treat as failed — retry — not a silent success).
 */
export async function wizperTranscribe(input: {
  mediaUrl: string;
  language?: string;
  onEnqueue?: (requestId: string) => void | Promise<void>;
}): Promise<WizperTranscription> {
  configureFalClient();

  const wizperInput = {
    audio_url: input.mediaUrl,
    task: "transcribe" as const,
    language: (input.language ?? "en") as "en",
    chunk_level: "segment" as const,
    max_segment_len: 10,
    merge_chunks: false,
  };

  console.log(
    "[wizper-submit]",
    JSON.stringify({
      endpoint: WIZPER_ENDPOINT,
      audio_url_host: safeHost(input.mediaUrl),
      language: wizperInput.language,
      chunk_level: wizperInput.chunk_level,
      max_segment_len: wizperInput.max_segment_len,
      merge_chunks: wizperInput.merge_chunks,
    }),
  );

  const { request_id: requestId } = await fal.queue.submit(WIZPER_ENDPOINT, {
    input: wizperInput,
  });

  await input.onEnqueue?.(requestId);

  await fal.queue.subscribeToStatus(WIZPER_ENDPOINT, {
    requestId,
    pollInterval: 3_000,
    logs: false,
  });

  const result = await fal.queue.result(WIZPER_ENDPOINT, { requestId });
  const data = result.data as WizperOutput;

  console.log(
    "[wizper-response]",
    JSON.stringify({
      requestId,
      chunkCount: data.chunks?.length ?? 0,
      textLength: (data.text ?? "").length,
      languages: data.languages ?? null,
      raw: data,
    }),
  );

  const segments = chunksToSegments(data.chunks ?? []);
  const durationSeconds = segments.length ? segments[segments.length - 1].end : 0;

  if (segments.length === 0) {
    throw new WizperEmptyResultError(
      `Wizper returned no speech chunks (fal request ${requestId}). ` +
        "This usually indicates a transient fal failure, balance lock, or a bad audio read — retry transcription. " +
        "Genuinely silent/music-only clips are rare; we fail rather than mark 'transcribed' with zero cues.",
      requestId,
      data,
      {
        audio_url_host: safeHost(input.mediaUrl),
        language: wizperInput.language,
        textLength: (data.text ?? "").length,
      },
    );
  }

  return {
    segments,
    durationSeconds,
    text: data.text ?? "",
    requestId,
    rawResponse: data,
  };
}

export function isWizperNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
