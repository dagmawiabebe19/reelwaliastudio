import "server-only";

import { withCredits } from "@/lib/credits/meter";
import {
  estimateTranscriptionCredits,
  transcriptionCreditsFromSeconds,
} from "@/lib/credits/pricing";
import type { ServiceDbClient } from "@/lib/db/service-client";
import {
  claimJobForTranscription,
  replaceCuesWith,
  setJobDuration,
  setJobStatus,
} from "@/lib/db/captioning";
import { prepareAudioForWhisper } from "@/lib/captioning/audio";
import { uploadVttForLanguage } from "@/lib/captioning/export";
import { segmentsToCues } from "@/lib/captioning/segmentation";
import { SOURCE_LANG, type WhisperSegment } from "@/lib/captioning/types";

const OPENAI_API_BASE = "https://api.openai.com/v1";
const WHISPER_MODEL = "whisper-1";

interface WhisperVerboseResponse {
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
  text?: string;
  error?: { message?: string };
}

export interface TranscriptionResult {
  segments: WhisperSegment[];
  durationSeconds: number;
}

/** Call OpenAI whisper-1 for segment-timestamped English transcription. */
export async function openAiTranscribe(input: {
  apiKey: string;
  audio: { buffer: Buffer; filename: string; mimeType: string };
}): Promise<TranscriptionResult> {
  const form = new FormData();
  const blob = new Blob([Uint8Array.from(input.audio.buffer)], {
    type: input.audio.mimeType,
  });
  form.append("file", blob, input.audio.filename);
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("language", "en");

  const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    body: form,
  });

  const text = await response.text();
  let body: WhisperVerboseResponse;
  try {
    body = JSON.parse(text) as WhisperVerboseResponse;
  } catch {
    body = { error: { message: text.slice(0, 500) } };
  }

  if (!response.ok) {
    throw new Error(body.error?.message ?? `Whisper request failed (${response.status}).`);
  }

  const segments: WhisperSegment[] = (body.segments ?? [])
    .filter((s) => typeof s.start === "number" && typeof s.end === "number")
    .map((s) => ({ start: s.start, end: s.end, text: s.text ?? "" }));

  const durationSeconds =
    typeof body.duration === "number" && body.duration > 0
      ? body.duration
      : segments.length > 0
        ? segments[segments.length - 1].end
        : 0;

  return { segments, durationSeconds };
}

export type TranscriptionOutcome =
  | { status: "transcribed"; cueCount: number }
  | { status: "failed"; reason: string }
  | { status: "skipped" };

/** Metered transcription job (background, service-role). */
export async function runTranscription(input: {
  jobId: string;
  db: ServiceDbClient;
}): Promise<TranscriptionOutcome> {
  const job = await claimJobForTranscription(input.db, input.jobId);
  if (!job) return { status: "skipped" };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    await setJobStatus(input.db, job.id, "failed", "Transcription is not configured.");
    return { status: "failed", reason: "Transcription is not configured." };
  }

  const reserveSeconds = job.duration_seconds ?? 90;
  const estimate = estimateTranscriptionCredits(reserveSeconds);
  const ext = extIfrom(job.video_storage_path);

  try {
    const cueCount = await withCredits(
      job.owner_id,
      estimate,
      `caption-transcribe:${job.id}`,
      async () => {
        const { data: fileData, error: downloadError } = await input.db.storage
          .from(job.video_bucket)
          .download(job.video_storage_path);

        if (downloadError || !fileData) {
          throw new Error("Could not download the uploaded video.");
        }

        const videoBuffer = Buffer.from(await fileData.arrayBuffer());
        const audio = await prepareAudioForWhisper(videoBuffer, ext);
        const { segments, durationSeconds } = await openAiTranscribe({ apiKey, audio });

        const cues = segmentsToCues(segments);
        await replaceCuesWith(input.db, job.id, SOURCE_LANG, cues);
        await uploadVttForLanguage(input.db, {
          ownerId: job.owner_id,
          jobId: job.id,
          lang: SOURCE_LANG,
        });

        if (durationSeconds > 0) {
          await setJobDuration(input.db, job.id, durationSeconds);
        }
        await setJobStatus(input.db, job.id, "transcribed");

        const actualCredits = transcriptionCreditsFromSeconds(
          durationSeconds > 0 ? durationSeconds : reserveSeconds,
        );
        return { result: cues.length, actualCredits };
      },
      { jobId: job.id, kind: "transcription" },
      { db: input.db },
    );

    console.log("[captioning] transcribed", { jobId: job.id, cueCount });
    return { status: "transcribed", cueCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Transcription failed.";
    await setJobStatus(input.db, job.id, "failed", reason);
    return { status: "failed", reason };
  }
}

function extIfrom(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot) : ".mp4";
}
