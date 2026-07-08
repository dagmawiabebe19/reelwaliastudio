import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getDbClient } from "@/lib/db/client";
import type { ServiceDbClient } from "@/lib/db/service-client";
import type { CaptionCue, CaptioningStatus, TranslationStatus } from "@/lib/captioning/types";
import { SOURCE_LANG } from "@/lib/captioning/types";

export type BurnStatus = "none" | "processing" | "ready" | "failed";

export type CaptioningJobRow = {
  id: string;
  owner_id: string;
  episode_id: string | null;
  title: string;
  video_bucket: string;
  video_storage_path: string;
  duration_seconds: number | null;
  source_lang: string;
  status: CaptioningStatus;
  fail_reason: string | null;
  english_approved_at: string | null;
  burn_status: BurnStatus;
  burn_fail_reason: string | null;
  burn_request_id: string | null;
  burn_endpoint: string | null;
  burned_video_path: string | null;
  created_at: string;
  updated_at: string;
};

export type CaptionCueRow = {
  id: string;
  job_id: string;
  lang: string;
  cue_index: number;
  start_ms: number;
  end_ms: number;
  text: string;
};

export type CaptionTranslationRow = {
  id: string;
  job_id: string;
  lang: string;
  status: TranslationStatus;
  fail_reason: string | null;
  updated_at: string;
};

type AnyDb = SupabaseClient | ServiceDbClient;

// ---------------------------------------------------------------------------
// User-scoped (RLS) reads/writes — used by pages + server actions
// ---------------------------------------------------------------------------

export async function createCaptioningJob(input: {
  title: string;
  videoBucket: string;
  videoStoragePath: string;
  durationSeconds: number | null;
  episodeId?: string | null;
}): Promise<CaptioningJobRow> {
  const ownerId = await getActiveUserId();
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("captioning_jobs")
    .insert({
      owner_id: ownerId,
      title: input.title,
      video_bucket: input.videoBucket,
      video_storage_path: input.videoStoragePath,
      duration_seconds: input.durationSeconds,
      episode_id: input.episodeId ?? null,
      status: "uploaded",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CaptioningJobRow;
}

export async function listCaptioningJobs(): Promise<CaptioningJobRow[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("captioning_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as CaptioningJobRow[];
}

export async function getCaptioningJob(jobId: string): Promise<CaptioningJobRow | null> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("captioning_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CaptioningJobRow | null) ?? null;
}

export async function listCues(jobId: string, lang: string): Promise<CaptionCueRow[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("caption_cues")
    .select("*")
    .eq("job_id", jobId)
    .eq("lang", lang)
    .order("cue_index", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CaptionCueRow[];
}

export async function listTranslations(jobId: string): Promise<CaptionTranslationRow[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("caption_translations")
    .select("*")
    .eq("job_id", jobId)
    .order("lang", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as CaptionTranslationRow[];
}

/** Replace the English source cues after a manual review edit (user-scoped). */
export async function saveEnglishCues(jobId: string, cues: CaptionCue[]): Promise<void> {
  const supabase = await getDbClient();
  await replaceCuesWith(supabase, jobId, SOURCE_LANG, cues);
}

export async function setEnglishApproved(jobId: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase
    .from("captioning_jobs")
    .update({ english_approved_at: new Date().toISOString(), status: "translating" })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function deleteCaptioningJob(jobId: string): Promise<void> {
  const supabase = await getDbClient();
  const { error } = await supabase.from("captioning_jobs").delete().eq("id", jobId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Shared cue replace (works with user or service client)
// ---------------------------------------------------------------------------

export async function replaceCuesWith(
  db: AnyDb,
  jobId: string,
  lang: string,
  cues: CaptionCue[],
): Promise<void> {
  const del = await db.from("caption_cues").delete().eq("job_id", jobId).eq("lang", lang);
  if (del.error) throw new Error(del.error.message);

  if (cues.length === 0) return;

  const rows = cues.map((cue, index) => ({
    job_id: jobId,
    lang,
    cue_index: index,
    start_ms: Math.round(cue.startMs),
    end_ms: Math.round(cue.endMs),
    text: cue.text,
  }));

  const { error } = await db.from("caption_cues").insert(rows);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Service-role (background job) helpers
// ---------------------------------------------------------------------------

export async function claimJobForTranscription(
  db: ServiceDbClient,
  jobId: string,
): Promise<CaptioningJobRow | null> {
  const { data: current, error: readError } = await db
    .from("captioning_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);
  if (!current || !["uploaded", "transcribing"].includes(current.status)) return null;

  const { data, error } = await db
    .from("captioning_jobs")
    .update({ status: "transcribing", fail_reason: null })
    .eq("id", jobId)
    .in("status", ["uploaded", "transcribing"])
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CaptioningJobRow | null) ?? null;
}

export async function setJobStatus(
  db: ServiceDbClient,
  jobId: string,
  status: CaptioningStatus,
  failReason: string | null = null,
): Promise<void> {
  const { error } = await db
    .from("captioning_jobs")
    .update({ status, fail_reason: failReason })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function setJobDuration(
  db: ServiceDbClient,
  jobId: string,
  durationSeconds: number,
): Promise<void> {
  const { error } = await db
    .from("captioning_jobs")
    .update({ duration_seconds: durationSeconds })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function getJobForService(
  db: ServiceDbClient,
  jobId: string,
): Promise<CaptioningJobRow | null> {
  const { data, error } = await db
    .from("captioning_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CaptioningJobRow | null) ?? null;
}

export async function getCuesForService(
  db: ServiceDbClient,
  jobId: string,
  lang: string,
): Promise<CaptionCueRow[]> {
  const { data, error } = await db
    .from("caption_cues")
    .select("*")
    .eq("job_id", jobId)
    .eq("lang", lang)
    .order("cue_index", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CaptionCueRow[];
}

export async function listPendingTranscriptionJobIds(db: ServiceDbClient): Promise<string[]> {
  const { data, error } = await db
    .from("captioning_jobs")
    .select("id")
    .eq("status", "transcribing")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

// --- translations -----------------------------------------------------------

export async function upsertTranslationStatus(
  db: AnyDb,
  jobId: string,
  lang: string,
  status: TranslationStatus,
  failReason: string | null = null,
): Promise<void> {
  const { error } = await db
    .from("caption_translations")
    .upsert(
      { job_id: jobId, lang, status, fail_reason: failReason },
      { onConflict: "job_id,lang" },
    );
  if (error) throw new Error(error.message);
}

export async function claimTranslation(
  db: ServiceDbClient,
  jobId: string,
  lang: string,
): Promise<boolean> {
  const { data: current } = await db
    .from("caption_translations")
    .select("status")
    .eq("job_id", jobId)
    .eq("lang", lang)
    .maybeSingle();

  if (current && current.status === "ready") return false;

  await upsertTranslationStatus(db, jobId, lang, "translating");
  return true;
}

export async function listPendingTranslations(
  db: ServiceDbClient,
): Promise<Array<{ job_id: string; lang: string }>> {
  const { data, error } = await db
    .from("caption_translations")
    .select("job_id, lang")
    .in("status", ["pending", "translating"])
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ job_id: string; lang: string }>;
}

// --- burn-in (open captions) ------------------------------------------------

export async function setBurnStatus(
  db: ServiceDbClient,
  jobId: string,
  status: BurnStatus,
  failReason: string | null = null,
): Promise<void> {
  const { error } = await db
    .from("captioning_jobs")
    .update({ burn_status: status, burn_fail_reason: failReason })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function setBurnRequest(
  db: ServiceDbClient,
  jobId: string,
  input: { requestId: string; endpoint: string },
): Promise<void> {
  const { error } = await db
    .from("captioning_jobs")
    .update({
      burn_status: "processing",
      burn_request_id: input.requestId,
      burn_endpoint: input.endpoint,
      burn_fail_reason: null,
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function setBurnedVideo(
  db: ServiceDbClient,
  jobId: string,
  burnedVideoPath: string,
): Promise<void> {
  const { error } = await db
    .from("captioning_jobs")
    .update({
      burn_status: "ready",
      burned_video_path: burnedVideoPath,
      burn_fail_reason: null,
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

/**
 * Atomically move an approved job into burn 'processing' from none/failed.
 * Clears any prior request id so a retry submits a fresh fal job. Returns the
 * row when claimed, or null if it wasn't eligible (already processing/ready,
 * or English not yet approved).
 */
export async function beginBurnIn(
  db: ServiceDbClient,
  jobId: string,
): Promise<CaptioningJobRow | null> {
  const { data: current, error: readError } = await db
    .from("captioning_jobs")
    .select("english_approved_at")
    .eq("id", jobId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current?.english_approved_at) return null;

  const { data, error } = await db
    .from("captioning_jobs")
    .update({
      burn_status: "processing",
      burn_request_id: null,
      burn_endpoint: null,
      burn_fail_reason: null,
    })
    .eq("id", jobId)
    .in("burn_status", ["none", "failed"])
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as CaptioningJobRow | null) ?? null;
}

export async function listBurnInProcessingJobs(
  db: ServiceDbClient,
): Promise<CaptioningJobRow[]> {
  const { data, error } = await db
    .from("captioning_jobs")
    .select("*")
    .eq("burn_status", "processing")
    .order("updated_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as CaptioningJobRow[];
}

export function cueRowsToCues(rows: CaptionCueRow[]): CaptionCue[] {
  return rows.map((row) => ({
    cueIndex: row.cue_index,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
  }));
}
