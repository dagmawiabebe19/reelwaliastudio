"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getActiveUserId } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCaptioningJob,
  getCaptioningJob,
  listCues,
  saveEnglishCues,
  setEnglishApproved,
  upsertTranslationStatus,
} from "@/lib/db/captioning";
import { CAPTIONING_BUCKET } from "@/lib/captioning/export";
import { TARGET_LANGUAGE_CODES } from "@/lib/captioning/languages";
import {
  scheduleTranscription,
  scheduleTranslation,
  scheduleTranslations,
} from "@/lib/captioning/sweep";
import { uploadVttForLanguage } from "@/lib/captioning/export";
import { buildVtt } from "@/lib/captioning/vtt";
import { SOURCE_LANG, type CaptionCue } from "@/lib/captioning/types";
import {
  estimateTranscriptionCredits,
  estimateTranslationCredits,
  estimateTranslationCreditsPerLanguage,
} from "@/lib/credits/pricing";
import { createClient } from "@/lib/supabase/server";

const MAX_VIDEO_BYTES = 524_288_000; // 500 MB — matches bucket limit
const ALLOWED_VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv"]);

function detectVideoExt(filename: string): string | null {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = lower.slice(dot);
  return ALLOWED_VIDEO_EXT.has(ext) ? ext : null;
}

export async function prepareCaptioningUploadAction(input: {
  filename: string;
  contentType: string;
  contentLength: number;
}) {
  try {
    const ownerId = await getActiveUserId();

    if (input.contentLength > MAX_VIDEO_BYTES) {
      return { error: "Video exceeds the 500 MB limit." };
    }

    const ext = detectVideoExt(input.filename);
    if (!ext) {
      return { error: "Upload a finished episode video (.mp4, .mov, .m4v, .webm, or .mkv)." };
    }

    const jobId = randomUUID();
    const storagePath = `${ownerId}/${jobId}/source${ext}`;

    return {
      uploadMethod: "direct" as const,
      bucket: "captioning" as const,
      storagePath,
      jobId,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to prepare upload.",
    };
  }
}

export async function finalizeCaptioningUploadAction(input: {
  bucket: string;
  storagePath: string;
  filename: string;
  durationSeconds: number | null;
  episodeId?: string | null;
}) {
  try {
    const ownerId = await getActiveUserId();
    const expectedPrefix = `${ownerId}/`;
    if (!input.storagePath.startsWith(expectedPrefix)) {
      return { error: "Storage path does not match the prepared upload." };
    }
    if (input.bucket !== CAPTIONING_BUCKET) {
      return { error: "Invalid bucket for captioning upload." };
    }

    const title = input.filename.replace(/\.[^.]+$/, "") || "Episode";
    const job = await createCaptioningJob({
      title,
      videoBucket: input.bucket,
      videoStoragePath: input.storagePath,
      durationSeconds: input.durationSeconds,
      episodeId: input.episodeId ?? null,
    });

    const admin = createAdminClient();
    await admin
      .from("captioning_jobs")
      .update({ status: "transcribing" })
      .eq("id", job.id);

    scheduleTranscription(job.id);
    revalidatePath("/captioning");
    revalidatePath(`/captioning/${job.id}`);

    return { success: true as const, jobId: job.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save upload.",
    };
  }
}

export async function estimateTranscriptionAction(jobId: string) {
  try {
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };
    const seconds = job.duration_seconds ?? 90;
    return {
      estimateCredits: estimateTranscriptionCredits(seconds),
      durationSeconds: seconds,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not estimate transcription cost.",
    };
  }
}

export async function estimateTranslationAction(jobId: string, languageCount?: number) {
  try {
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };
    const cues = await listCues(jobId, SOURCE_LANG);
    const langs = languageCount ?? TARGET_LANGUAGE_CODES.length;
    return {
      estimateCredits: estimateTranslationCredits(cues.length, langs),
      perLanguageCredits: estimateTranslationCreditsPerLanguage(cues.length),
      cueCount: cues.length,
      languageCount: langs,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not estimate translation cost.",
    };
  }
}

export async function saveEnglishCuesAction(
  jobId: string,
  cues: Array<{ startMs: number; endMs: number; text: string }>,
) {
  try {
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };
    if (job.english_approved_at) {
      return { error: "English is already approved. Regenerate a language instead." };
    }

    const normalized: CaptionCue[] = cues.map((cue, index) => ({
      cueIndex: index,
      startMs: Math.round(cue.startMs),
      endMs: Math.round(cue.endMs),
      text: cue.text.trim(),
    }));

    await saveEnglishCues(jobId, normalized);

    const admin = createAdminClient();
    await uploadVttForLanguage(admin, {
      ownerId: job.owner_id,
      jobId,
      lang: SOURCE_LANG,
    });

    revalidatePath(`/captioning/${jobId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save cues.",
    };
  }
}

export async function approveEnglishAndTranslateAction(jobId: string) {
  try {
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };
    if (job.status !== "transcribed" && job.status !== "ready") {
      return { error: "Transcription must finish before approving English." };
    }
    if (job.english_approved_at) {
      return { error: "English is already approved." };
    }

    const cues = await listCues(jobId, SOURCE_LANG);
    if (cues.length === 0) {
      return {
        error:
          "No speech was detected in this video. Add English cues manually, then approve again.",
      };
    }

    await setEnglishApproved(jobId);

    const admin = createAdminClient();
    for (const lang of TARGET_LANGUAGE_CODES) {
      await upsertTranslationStatus(admin, jobId, lang, "pending");
    }

    scheduleTranslations(jobId, TARGET_LANGUAGE_CODES);
    revalidatePath(`/captioning/${jobId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to start translation.",
    };
  }
}

export async function regenerateLanguageAction(jobId: string, lang: string) {
  try {
    if (!TARGET_LANGUAGE_CODES.includes(lang)) {
      return { error: "Unsupported language." };
    }
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };
    if (!job.english_approved_at) {
      return { error: "Approve English before regenerating translations." };
    }

    const admin = createAdminClient();
    await upsertTranslationStatus(admin, jobId, lang, "pending");
    scheduleTranslation(jobId, lang);
    revalidatePath(`/captioning/${jobId}`);
    return { success: true as const };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to regenerate language.",
    };
  }
}

export async function getCaptionVideoUrlAction(jobId: string) {
  try {
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };

    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from(job.video_bucket)
      .createSignedUrl(job.video_storage_path, 3600);

    if (error || !data?.signedUrl) {
      return { error: "Could not load video." };
    }
    return { url: data.signedUrl };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not load video.",
    };
  }
}

export async function getCaptionVttAction(jobId: string, lang: string) {
  try {
    const job = await getCaptioningJob(jobId);
    if (!job) return { error: "Job not found." };

    const cues = await listCues(jobId, lang);
    if (cues.length === 0) return { error: "No captions for this language yet." };

    const vtt = buildVtt(
      cues.map((row) => ({
        cueIndex: row.cue_index,
        startMs: row.start_ms,
        endMs: row.end_ms,
        text: row.text,
      })),
    );
    return { vtt, filename: `${job.title}-${lang}.vtt` };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not load captions.",
    };
  }
}
