import "server-only";

import { isAdmin } from "@/lib/auth/isAdmin";
import { assertSufficientCredits } from "@/lib/credits/meter";
import {
  commitReservation,
  releaseReservation,
  reserveCredits,
} from "@/lib/credits/mutations";
import {
  findOpenReservationByReference,
  isReservationOpen,
} from "@/lib/credits/reservations";
import { estimateBurnInCredits } from "@/lib/credits/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceDbClient } from "@/lib/db/service-client";
import {
  cueRowsToCues,
  getCuesForService,
  getJobForService,
} from "@/lib/db/captioning";
import {
  claimBurnedExportForRender,
  getBurnedExportById,
  listProcessingBurnedExports,
  setBurnedExportFailed,
  setBurnedExportReady,
  setBurnedExportRequest,
  upsertBurnedExportQueued,
} from "@/lib/db/caption-burns";
import {
  BURN_EXPORT_RESOLUTION,
  burnExportCreditReference,
  burnedExportStoragePath,
  fingerprintCues,
  veedLocaleForCaptionLang,
} from "@/lib/captioning/burn-export";
import { getBurnInStyle } from "@/lib/captioning/burn-style";
import { buildSrt } from "@/lib/captioning/srt";
import { SOURCE_LANG } from "@/lib/captioning/types";
import { getLanguage } from "@/lib/captioning/languages";
import { withImageRetries } from "@/lib/ai/generation/image-retry";
import {
  buildVeedInput,
  getSubtitleBurnResultUrl,
  getSubtitleBurnStatus,
  submitSubtitleBurnJob,
  SUBTITLE_BURN_ENDPOINT,
  uploadSrtToFal,
  waitForSubtitleBurnCompletion,
} from "@/lib/ai/video/subtitle-burn";

const SOURCE_SIGNED_URL_TTL_SECONDS = 6 * 3600;

export type LangBurnOutcome =
  | { status: "ready"; exportId: string; lang: string }
  | { status: "rendering"; exportId: string; lang: string; requestId?: string }
  | { status: "failed"; exportId: string; lang: string; reason: string }
  | { status: "skipped"; exportId?: string; lang: string; reason?: string };

async function commitExportReservation(
  jobId: string,
  lang: string,
  credits: number,
): Promise<void> {
  const reference = burnExportCreditReference(jobId, lang);
  const reservation = await findOpenReservationByReference(reference);
  if (reservation && (await isReservationOpen(reservation.reservationId))) {
    await commitReservation(reservation.reservationId, credits);
  }
}

async function releaseExportReservation(jobId: string, lang: string): Promise<void> {
  const reference = burnExportCreditReference(jobId, lang);
  const reservation = await findOpenReservationByReference(reference);
  if (reservation && (await isReservationOpen(reservation.reservationId))) {
    await releaseReservation(reservation.reservationId);
  }
}

async function storeExportVideo(
  db: ServiceDbClient,
  input: {
    ownerId: string;
    jobId: string;
    lang: string;
    bucket: string;
    falVideoUrl: string;
  },
): Promise<string> {
  const response = await withImageRetries(`caption-burn-download:${input.lang}`, async () => {
    const res = await fetch(input.falVideoUrl);
    if (!res.ok) throw new Error(`Failed to download burned video (${res.status}).`);
    return res;
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const path = burnedExportStoragePath(input.ownerId, input.jobId, input.lang);

  const { error } = await db.storage.from(input.bucket).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Enqueue per-language burned exports. Skips langs that are already ready
 * with matching source video + cues fingerprints (unless force).
 */
export async function enqueueLanguageBurnExports(input: {
  jobId: string;
  langs: string[];
  force?: boolean;
  db?: ServiceDbClient;
}): Promise<{
  queued: string[];
  ready: string[];
  skipped: Array<{ lang: string; reason: string }>;
  exportIds: string[];
}> {
  const db = input.db ?? createAdminClient();
  const job = await getJobForService(db, input.jobId);
  if (!job) throw new Error("Job not found.");
  if (!job.english_approved_at) {
    throw new Error("Approve English before rendering burned-in exports.");
  }

  const queued: string[] = [];
  const ready: string[] = [];
  const skipped: Array<{ lang: string; reason: string }> = [];
  const exportIds: string[] = [];

  for (const lang of input.langs) {
    if (!getLanguage(lang)) {
      skipped.push({ lang, reason: "Unsupported language." });
      continue;
    }

    const cueRows = await getCuesForService(db, job.id, lang);
    const cues = cueRowsToCues(cueRows);
    if (cues.length === 0) {
      skipped.push({
        lang,
        reason:
          lang === SOURCE_LANG
            ? "No English cues."
            : "Translation not ready — finish that language first.",
      });
      continue;
    }

    const fingerprint = fingerprintCues(cues);
    const row = await upsertBurnedExportQueued(db, {
      jobId: job.id,
      lang,
      sourceVideoPath: job.video_storage_path,
      cuesFingerprint: fingerprint,
      force: input.force,
    });

    exportIds.push(row.id);

    if (
      row.status === "ready" &&
      row.storage_path &&
      row.source_video_path === job.video_storage_path &&
      row.cues_fingerprint === fingerprint &&
      !input.force
    ) {
      ready.push(lang);
      continue;
    }

    if (row.status === "queued") {
      queued.push(lang);
    } else if (row.status === "rendering") {
      skipped.push({ lang, reason: "Already rendering." });
    } else {
      // force path re-queued above
      queued.push(lang);
    }
  }

  return { queued, ready, skipped, exportIds };
}

export async function runLanguageBurnExport(input: {
  exportId: string;
  db: ServiceDbClient;
}): Promise<LangBurnOutcome> {
  const claimed =
    (await claimBurnedExportForRender(input.db, input.exportId)) ??
    (await getBurnedExportById(input.db, input.exportId));

  if (!claimed) {
    return { status: "skipped", lang: "?", reason: "Export not found." };
  }

  // Already submitted — let reconcile finish it.
  if (claimed.status === "rendering" && claimed.request_id) {
    return {
      status: "rendering",
      exportId: claimed.id,
      lang: claimed.lang,
      requestId: claimed.request_id,
    };
  }

  // Only run freshly claimed queued→rendering rows without a request yet.
  if (claimed.status !== "rendering" || claimed.request_id) {
    return {
      status: "skipped",
      exportId: claimed.id,
      lang: claimed.lang,
      reason: `status=${claimed.status}`,
    };
  }

  const job = await getJobForService(input.db, claimed.job_id);
  if (!job) {
    await setBurnedExportFailed(input.db, claimed.id, "Job not found.");
    return { status: "failed", exportId: claimed.id, lang: claimed.lang, reason: "Job not found." };
  }

  const key = process.env.FAL_KEY?.trim();
  if (!key) {
    await setBurnedExportFailed(input.db, claimed.id, "Burn-in is not configured.");
    return {
      status: "failed",
      exportId: claimed.id,
      lang: claimed.lang,
      reason: "Burn-in is not configured.",
    };
  }

  const cueRows = await getCuesForService(input.db, job.id, claimed.lang);
  const cues = cueRowsToCues(cueRows);
  if (cues.length === 0) {
    await setBurnedExportFailed(input.db, claimed.id, "No captions for this language.");
    return {
      status: "failed",
      exportId: claimed.id,
      lang: claimed.lang,
      reason: "No captions for this language.",
    };
  }

  const style = getBurnInStyle();
  const estimate = estimateBurnInCredits(
    job.duration_seconds ? Number(job.duration_seconds) : 90,
    style.preset,
  );

  try {
    await assertSufficientCredits(job.owner_id, estimate, input.db);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Insufficient credits.";
    await setBurnedExportFailed(input.db, claimed.id, reason);
    return { status: "failed", exportId: claimed.id, lang: claimed.lang, reason };
  }

  const admin = await isAdmin(job.owner_id, input.db);
  let reserved = false;
  try {
    await reserveCredits(job.owner_id, estimate, burnExportCreditReference(job.id, claimed.lang), {
      jobId: job.id,
      lang: claimed.lang,
      kind: "caption-burn-export",
      resolution: BURN_EXPORT_RESOLUTION,
    });
    reserved = true;
  } catch (error) {
    if (!admin) {
      await setBurnedExportFailed(input.db, claimed.id, "Could not reserve credits.");
      return {
        status: "failed",
        exportId: claimed.id,
        lang: claimed.lang,
        reason: "Could not reserve credits.",
      };
    }
    console.warn("[caption-burn-export] admin reserve failed, continuing", {
      exportId: claimed.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const { data: signed, error: signError } = await input.db.storage
      .from(job.video_bucket)
      .createSignedUrl(job.video_storage_path, SOURCE_SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      throw new Error("Could not create a source video URL for fal.");
    }

    const srtContent = buildSrt(cues);
    const srtFileUrl = await withImageRetries(`caption-burn-srt:${claimed.lang}`, () =>
      uploadSrtToFal(srtContent),
    );

    const veedInput = buildVeedInput({
      videoUrl: signed.signedUrl,
      srtFileUrl,
      style,
      language: veedLocaleForCaptionLang(claimed.lang),
    });

    const requestId = await withImageRetries(`caption-burn-submit:${claimed.lang}`, () =>
      submitSubtitleBurnJob(veedInput, {
        onEnqueue: async (id) => {
          await setBurnedExportRequest(input.db, claimed.id, {
            requestId: id,
            endpoint: SUBTITLE_BURN_ENDPOINT,
          });
        },
      }),
    );

    const finalStatus = await waitForSubtitleBurnCompletion(requestId);

    if (finalStatus.status === "COMPLETED") {
      const falUrl = await getSubtitleBurnResultUrl(requestId);
      const storedPath = await storeExportVideo(input.db, {
        ownerId: job.owner_id,
        jobId: job.id,
        lang: claimed.lang,
        bucket: job.video_bucket,
        falVideoUrl: falUrl,
      });
      await setBurnedExportReady(input.db, claimed.id, {
        storagePath: storedPath,
        storageBucket: job.video_bucket,
      });
      await commitExportReservation(job.id, claimed.lang, estimate);
      return { status: "ready", exportId: claimed.id, lang: claimed.lang };
    }

    if (finalStatus.status === "FAILED") {
      const reason = finalStatus.error ?? "fal reported the burn-in job failed.";
      await setBurnedExportFailed(input.db, claimed.id, reason);
      await releaseExportReservation(job.id, claimed.lang);
      return { status: "failed", exportId: claimed.id, lang: claimed.lang, reason };
    }

    return {
      status: "rendering",
      exportId: claimed.id,
      lang: claimed.lang,
      requestId,
    };
  } catch (error) {
    const refreshed = await getBurnedExportById(input.db, claimed.id);
    if (refreshed?.request_id) {
      console.warn("[caption-burn-export] watcher interrupted after enqueue", {
        exportId: claimed.id,
        requestId: refreshed.request_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "rendering",
        exportId: claimed.id,
        lang: claimed.lang,
        requestId: refreshed.request_id,
      };
    }

    if (reserved) await releaseExportReservation(job.id, claimed.lang);
    const reason = error instanceof Error ? error.message : "Burn-in failed.";
    await setBurnedExportFailed(input.db, claimed.id, reason);
    return { status: "failed", exportId: claimed.id, lang: claimed.lang, reason };
  }
}

export async function reconcileLanguageBurnExport(input: {
  exportId: string;
  db: ServiceDbClient;
}): Promise<LangBurnOutcome> {
  const row = await getBurnedExportById(input.db, input.exportId);
  if (!row) return { status: "skipped", lang: "?", reason: "missing" };

  if (row.status === "queued") {
    return runLanguageBurnExport({ exportId: row.id, db: input.db });
  }

  if (row.status !== "rendering") {
    return { status: "skipped", exportId: row.id, lang: row.lang, reason: row.status };
  }

  if (!row.request_id) {
    await setBurnedExportFailed(
      input.db,
      row.id,
      "Burn-in was interrupted before it started. Please retry.",
    );
    await releaseExportReservation(row.job_id, row.lang);
    return {
      status: "failed",
      exportId: row.id,
      lang: row.lang,
      reason: "no_request_id",
    };
  }

  const job = await getJobForService(input.db, row.job_id);
  if (!job) {
    await setBurnedExportFailed(input.db, row.id, "Job not found.");
    return { status: "failed", exportId: row.id, lang: row.lang, reason: "Job not found." };
  }

  const estimate = estimateBurnInCredits(
    job.duration_seconds ? Number(job.duration_seconds) : 90,
    getBurnInStyle().preset,
  );

  const status = await getSubtitleBurnStatus(row.request_id);

  if (status.status === "NOT_FOUND") {
    await setBurnedExportFailed(
      input.db,
      row.id,
      "The burn-in job could not be found on fal. Please retry.",
    );
    await releaseExportReservation(row.job_id, row.lang);
    return { status: "failed", exportId: row.id, lang: row.lang, reason: "request_not_found" };
  }

  if (status.status === "COMPLETED") {
    const falUrl = await getSubtitleBurnResultUrl(row.request_id);
    const storedPath = await storeExportVideo(input.db, {
      ownerId: job.owner_id,
      jobId: job.id,
      lang: row.lang,
      bucket: job.video_bucket,
      falVideoUrl: falUrl,
    });
    await setBurnedExportReady(input.db, row.id, {
      storagePath: storedPath,
      storageBucket: job.video_bucket,
    });
    await commitExportReservation(job.id, row.lang, estimate);
    return { status: "ready", exportId: row.id, lang: row.lang };
  }

  if (status.status === "FAILED") {
    const reason = status.error ?? "fal reported the burn-in job failed.";
    await setBurnedExportFailed(input.db, row.id, reason);
    await releaseExportReservation(row.job_id, row.lang);
    return { status: "failed", exportId: row.id, lang: row.lang, reason };
  }

  const finalStatus = await waitForSubtitleBurnCompletion(row.request_id);
  if (finalStatus.status === "COMPLETED") {
    const falUrl = await getSubtitleBurnResultUrl(row.request_id);
    const storedPath = await storeExportVideo(input.db, {
      ownerId: job.owner_id,
      jobId: job.id,
      lang: row.lang,
      bucket: job.video_bucket,
      falVideoUrl: falUrl,
    });
    await setBurnedExportReady(input.db, row.id, {
      storagePath: storedPath,
      storageBucket: job.video_bucket,
    });
    await commitExportReservation(job.id, row.lang, estimate);
    return { status: "ready", exportId: row.id, lang: row.lang };
  }
  if (finalStatus.status === "FAILED") {
    const reason = finalStatus.error ?? "fal reported the burn-in job failed.";
    await setBurnedExportFailed(input.db, row.id, reason);
    await releaseExportReservation(row.job_id, row.lang);
    return { status: "failed", exportId: row.id, lang: row.lang, reason };
  }

  return {
    status: "rendering",
    exportId: row.id,
    lang: row.lang,
    requestId: row.request_id,
  };
}

export async function reconcileProcessingLanguageBurns(input?: {
  db?: ServiceDbClient;
}): Promise<{ processed: number }> {
  const db = input?.db ?? createAdminClient();
  const rows = await listProcessingBurnedExports(db);
  for (const row of rows) {
    try {
      await reconcileLanguageBurnExport({ exportId: row.id, db });
    } catch (error) {
      console.error("[caption-burn-export] reconcile failed", {
        exportId: row.id,
        lang: row.lang,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { processed: rows.length };
}
