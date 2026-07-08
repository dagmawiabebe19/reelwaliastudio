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
  getCuesForService,
  getJobForService,
  listBurnInProcessingJobs,
  setBurnRequest,
  setBurnStatus,
  setBurnedVideo,
  cueRowsToCues,
  type CaptioningJobRow,
} from "@/lib/db/captioning";
import { buildSrt } from "@/lib/captioning/srt";
import { getBurnInStyle } from "@/lib/captioning/burn-style";
import { SOURCE_LANG } from "@/lib/captioning/types";
import {
  buildVeedInput,
  getSubtitleBurnResultUrl,
  getSubtitleBurnStatus,
  submitSubtitleBurnJob,
  SUBTITLE_BURN_ENDPOINT,
  waitForSubtitleBurnCompletion,
} from "@/lib/ai/video/subtitle-burn";

const SOURCE_SIGNED_URL_TTL_SECONDS = 6 * 3600;

export function burnCreditReference(jobId: string): string {
  return `caption-burn:${jobId}`;
}

function burnedVideoPath(ownerId: string, jobId: string): string {
  return `${ownerId}/${jobId}/burned/english.mp4`;
}

export type BurnInOutcome =
  | { status: "ready"; jobId: string }
  | { status: "processing"; jobId: string; requestId: string }
  | { status: "failed"; jobId: string; reason: string }
  | { status: "skipped"; jobId: string };

async function commitBurnReservation(jobId: string, credits: number): Promise<void> {
  const reservation = await findOpenReservationByReference(burnCreditReference(jobId));
  if (reservation && (await isReservationOpen(reservation.reservationId))) {
    await commitReservation(reservation.reservationId, credits);
  }
}

async function releaseBurnReservation(jobId: string): Promise<void> {
  const reservation = await findOpenReservationByReference(burnCreditReference(jobId));
  if (reservation && (await isReservationOpen(reservation.reservationId))) {
    await releaseReservation(reservation.reservationId);
  }
}

/** Download the burned MP4 from fal and store it under the job's bucket. */
async function storeBurnedVideo(
  db: ServiceDbClient,
  job: CaptioningJobRow,
  falVideoUrl: string,
): Promise<string> {
  const response = await fetch(falVideoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download burned video (${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const path = burnedVideoPath(job.owner_id, job.id);

  const { error } = await db.storage.from(job.video_bucket).upload(path, buffer, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Finalize a completed burn: store MP4, mark ready, commit credits. */
async function finalizeBurnCompletion(
  db: ServiceDbClient,
  job: CaptioningJobRow,
  requestId: string,
): Promise<void> {
  const falVideoUrl = await getSubtitleBurnResultUrl(requestId);
  const storedPath = await storeBurnedVideo(db, job, falVideoUrl);
  await setBurnedVideo(db, job.id, storedPath);

  const credits = estimateBurnInCredits(
    job.duration_seconds ? Number(job.duration_seconds) : 90,
    getBurnInStyle().preset,
  );
  await commitBurnReservation(job.id, credits);

  console.log("[caption-burn] ready", { jobId: job.id, requestId, storedPath });
}

async function failBurn(
  db: ServiceDbClient,
  jobId: string,
  reason: string,
): Promise<void> {
  await setBurnStatus(db, jobId, "failed", reason);
  await releaseBurnReservation(jobId);
}

/**
 * Submit a burn-in job and watch it to completion. Reserves once up front,
 * stores the fal request id immediately (so a restart can reconcile), commits
 * on success, releases on failure.
 */
export async function runBurnIn(input: {
  jobId: string;
  db: ServiceDbClient;
}): Promise<BurnInOutcome> {
  const job = await getJobForService(input.db, input.jobId);
  // Only act on a job the action just moved to 'processing' that hasn't been
  // submitted yet — guards against double-submit if scheduled twice.
  if (!job || job.burn_status !== "processing" || job.burn_request_id) {
    return { status: "skipped", jobId: input.jobId };
  }

  const key = process.env.FAL_KEY?.trim();
  if (!key) {
    await failBurn(input.db, job.id, "Burn-in is not configured.");
    return { status: "failed", jobId: job.id, reason: "Burn-in is not configured." };
  }

  const cueRows = await getCuesForService(input.db, job.id, SOURCE_LANG);
  const cues = cueRowsToCues(cueRows);
  if (cues.length === 0) {
    await failBurn(input.db, job.id, "No English cues to burn in.");
    return { status: "failed", jobId: job.id, reason: "No English cues to burn in." };
  }

  const style = getBurnInStyle();
  const estimate = estimateBurnInCredits(
    job.duration_seconds ? Number(job.duration_seconds) : 90,
    style.preset,
  );

  // Block non-admins before any paid fal work.
  try {
    await assertSufficientCredits(job.owner_id, estimate);
  } catch (error) {
    await failBurn(input.db, job.id, error instanceof Error ? error.message : "Insufficient credits.");
    return {
      status: "failed",
      jobId: job.id,
      reason: error instanceof Error ? error.message : "Insufficient credits.",
    };
  }

  // Reserve once for this logical burn job.
  const admin = await isAdmin(job.owner_id);
  let reserved = false;
  try {
    await reserveCredits(job.owner_id, estimate, burnCreditReference(job.id), {
      jobId: job.id,
      kind: "caption-burn",
    });
    reserved = true;
  } catch (error) {
    if (!admin) {
      await setBurnStatus(input.db, job.id, "failed", "Could not reserve credits.");
      return { status: "failed", jobId: job.id, reason: "Could not reserve credits." };
    }
    console.warn("[caption-burn] admin reserve failed, continuing", {
      jobId: job.id,
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

    const veedInput = buildVeedInput({
      videoUrl: signed.signedUrl,
      srtContent: buildSrt(cues),
      style,
    });

    const requestId = await submitSubtitleBurnJob(veedInput, {
      onEnqueue: async (id) => {
        await setBurnRequest(input.db, job.id, {
          requestId: id,
          endpoint: SUBTITLE_BURN_ENDPOINT,
        });
      },
    });

    const finalStatus = await waitForSubtitleBurnCompletion(requestId);

    if (finalStatus.status === "COMPLETED") {
      await finalizeBurnCompletion(input.db, job, requestId);
      return { status: "ready", jobId: job.id };
    }

    if (finalStatus.status === "FAILED") {
      const reason = finalStatus.error ?? "fal reported the burn-in job failed.";
      await failBurn(input.db, job.id, reason);
      return { status: "failed", jobId: job.id, reason };
    }

    // Still running — leave it processing; the sweep/watcher will reconcile.
    return { status: "processing", jobId: job.id, requestId };
  } catch (error) {
    const refreshed = await getJobForService(input.db, job.id);
    // fal accepted the job — keep processing + reservation for reconcile.
    if (refreshed?.burn_request_id) {
      console.warn("[caption-burn] watcher interrupted after enqueue", {
        jobId: job.id,
        requestId: refreshed.burn_request_id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "processing",
        jobId: job.id,
        requestId: refreshed.burn_request_id,
      };
    }

    if (reserved) await releaseBurnReservation(job.id);
    const reason = error instanceof Error ? error.message : "Burn-in failed.";
    await setBurnStatus(input.db, job.id, "failed", reason);
    return { status: "failed", jobId: job.id, reason };
  }
}

/**
 * Reconcile a burn job that is already 'processing' with a stored request id
 * (e.g. after a server restart). Commits/releases the existing reservation —
 * never reserves again.
 */
export async function reconcileBurnInJob(input: {
  jobId: string;
  db: ServiceDbClient;
}): Promise<BurnInOutcome> {
  const job = await getJobForService(input.db, input.jobId);
  if (!job || job.burn_status !== "processing") {
    return { status: "skipped", jobId: input.jobId };
  }

  if (!job.burn_request_id) {
    await failBurn(input.db, job.id, "Burn-in was interrupted before it started. Please retry.");
    return { status: "failed", jobId: job.id, reason: "no_request_id" };
  }

  const status = await getSubtitleBurnStatus(job.burn_request_id);

  if (status.status === "NOT_FOUND") {
    await failBurn(input.db, job.id, "The burn-in job could not be found on fal. Please retry.");
    return { status: "failed", jobId: job.id, reason: "request_not_found" };
  }

  if (status.status === "COMPLETED") {
    await finalizeBurnCompletion(input.db, job, job.burn_request_id);
    return { status: "ready", jobId: job.id };
  }

  if (status.status === "FAILED") {
    const reason = status.error ?? "fal reported the burn-in job failed.";
    await failBurn(input.db, job.id, reason);
    return { status: "failed", jobId: job.id, reason };
  }

  // Still in queue/progress — wait for it (detached caller).
  const finalStatus = await waitForSubtitleBurnCompletion(job.burn_request_id);
  if (finalStatus.status === "COMPLETED") {
    await finalizeBurnCompletion(input.db, job, job.burn_request_id);
    return { status: "ready", jobId: job.id };
  }
  if (finalStatus.status === "FAILED") {
    const reason = finalStatus.error ?? "fal reported the burn-in job failed.";
    await failBurn(input.db, job.id, reason);
    return { status: "failed", jobId: job.id, reason };
  }

  return { status: "processing", jobId: job.id, requestId: job.burn_request_id };
}

export async function reconcileProcessingBurnJobs(input?: {
  db?: ServiceDbClient;
}): Promise<{ processed: number }> {
  const db = input?.db ?? createAdminClient();
  const jobs = await listBurnInProcessingJobs(db);
  for (const job of jobs) {
    try {
      await reconcileBurnInJob({ jobId: job.id, db });
    } catch (error) {
      console.error("[caption-burn] reconcile failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { processed: jobs.length };
}
