import "server-only";

import { withCredits } from "@/lib/credits/meter";
import { estimateTranscriptionCredits } from "@/lib/credits/pricing";
import type { ServiceDbClient } from "@/lib/db/service-client";
import {
  claimJobForTranscription,
  replaceCuesWith,
  setJobDuration,
  setJobStatus,
} from "@/lib/db/captioning";
import { uploadVttForLanguage } from "@/lib/captioning/export";
import { segmentsToCues } from "@/lib/captioning/segmentation";
import { SOURCE_LANG } from "@/lib/captioning/types";
import { wizperTranscribe, WizperEmptyResultError } from "@/lib/ai/audio/wizper";
import { extractAudioOnFal } from "@/lib/ai/audio/extract-audio";

/** fal fetches the source itself from a signed URL — keep it valid for the whole job. */
const SOURCE_SIGNED_URL_TTL_SECONDS = 6 * 3600;

export type TranscriptionOutcome =
  | { status: "transcribed"; cueCount: number }
  | { status: "failed"; reason: string }
  | { status: "skipped" };

/**
 * Metered transcription job (background, service-role).
 *
 * Transcription runs entirely on fal (Wizper / Whisper v3): we hand fal a
 * signed URL to the uploaded episode and it pulls + transcribes on real
 * compute. No audio extraction, no ffmpeg on Vercel, and no OpenAI 25 MB file
 * cap — a full 40–150 MB+ episode transcribes without any client-side work.
 */
export async function runTranscription(input: {
  jobId: string;
  db: ServiceDbClient;
}): Promise<TranscriptionOutcome> {
  const job = await claimJobForTranscription(input.db, input.jobId);
  if (!job) return { status: "skipped" };

  if (!process.env.FAL_KEY?.trim()) {
    await setJobStatus(input.db, job.id, "failed", "Transcription is not configured.");
    return { status: "failed", reason: "Transcription is not configured." };
  }

  const reserveSeconds = job.duration_seconds ?? 90;
  const estimate = estimateTranscriptionCredits(reserveSeconds);

  try {
    const cueCount = await withCredits(
      job.owner_id,
      estimate,
      `caption-transcribe:${job.id}`,
      async () => {
        const { data: signed, error: signError } = await input.db.storage
          .from(job.video_bucket)
          .createSignedUrl(job.video_storage_path, SOURCE_SIGNED_URL_TTL_SECONDS);

        if (signError || !signed?.signedUrl) {
          throw new Error("Could not create a source video URL for transcription.");
        }

        // Extract a clean audio-only file on fal first. Handing the muxed video
        // straight to Wizper can yield an empty transcript for some MP4 exports
        // (container/demux quirks); a bare audio track transcribes reliably.
        let transcribeUrl = signed.signedUrl;
        try {
          transcribeUrl = await extractAudioOnFal({ mediaUrl: signed.signedUrl });
          console.log("[captioning] audio extracted for transcription", { jobId: job.id });
        } catch (extractError) {
          console.warn("[captioning] fal audio extraction failed; using video directly", {
            jobId: job.id,
            error: extractError instanceof Error ? extractError.message : String(extractError),
          });
        }

        const wizperResult = await wizperTranscribe({
          mediaUrl: transcribeUrl,
          language: "en",
        });

        const { segments, durationSeconds } = wizperResult;
        const cues = segmentsToCues(segments);

        if (cues.length === 0) {
          throw new WizperEmptyResultError(
            `Wizper returned segments but no caption cues were produced (fal request ${wizperResult.requestId}). Retry transcription.`,
            wizperResult.requestId,
            wizperResult.rawResponse,
            { jobId: job.id },
          );
        }

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

        const actualCredits = estimateTranscriptionCredits(
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
    const reason =
      error instanceof WizperEmptyResultError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Transcription failed.";
    await setJobStatus(input.db, job.id, "failed", reason);
    return { status: "failed", reason };
  }
}
