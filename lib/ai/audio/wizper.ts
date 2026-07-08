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

type WizperOutput = {
  text?: string;
  chunks?: WizperChunk[];
  languages?: string[];
};

export interface WizperTranscription {
  segments: WhisperSegment[];
  durationSeconds: number;
  text: string;
}

/** Map Wizper's timestamped chunks into our segment shape (seconds). */
function chunksToSegments(chunks: WizperChunk[]): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  let lastEnd = 0;

  for (const chunk of chunks) {
    const text = (chunk.text ?? "").trim();
    if (!text) continue;

    const ts = chunk.timestamp ?? [];
    const rawStart = typeof ts[0] === "number" ? (ts[0] as number) : lastEnd;
    const rawEnd = typeof ts[1] === "number" ? (ts[1] as number) : rawStart + 2;
    const start = Math.max(0, rawStart);
    const end = Math.max(start + 0.2, rawEnd);
    lastEnd = end;

    segments.push({ start, end, text });
  }

  return segments;
}

/**
 * Transcribe a media URL with fal Wizper. Submits to the queue, waits for
 * completion, and returns timestamped English segments.
 */
export async function wizperTranscribe(input: {
  mediaUrl: string;
  language?: string;
  onEnqueue?: (requestId: string) => void | Promise<void>;
}): Promise<WizperTranscription> {
  configureFalClient();

  console.log("[wizper-submit]", JSON.stringify({ endpoint: WIZPER_ENDPOINT }));

  const { request_id: requestId } = await fal.queue.submit(WIZPER_ENDPOINT, {
    input: {
      audio_url: input.mediaUrl,
      task: "transcribe",
      // fal types this as a language enum; we only ever pass ISO codes.
      language: (input.language ?? "en") as "en",
      chunk_level: "segment",
      // Finer, unmerged segments → tighter caption timing for review/sync.
      max_segment_len: 10,
      merge_chunks: false,
    },
  });

  await input.onEnqueue?.(requestId);

  await fal.queue.subscribeToStatus(WIZPER_ENDPOINT, {
    requestId,
    pollInterval: 3_000,
    logs: false,
  });

  const result = await fal.queue.result(WIZPER_ENDPOINT, { requestId });
  const data = result.data as WizperOutput;

  const segments = chunksToSegments(data.chunks ?? []);
  const durationSeconds = segments.length ? segments[segments.length - 1].end : 0;

  if (!segments.length && !(data.text ?? "").trim()) {
    // Genuinely no speech detected — surface as empty, not an error.
    return { segments: [], durationSeconds: 0, text: "" };
  }

  return { segments, durationSeconds, text: data.text ?? "" };
}

export function isWizperNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
