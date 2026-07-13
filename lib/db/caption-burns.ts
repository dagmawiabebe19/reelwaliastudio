import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { ServiceDbClient } from "@/lib/db/service-client";
import type {
  BurnExportStatus,
  CaptionBurnedExportRow,
} from "@/lib/captioning/burn-export-types";
import { BURN_EXPORT_RESOLUTION } from "@/lib/captioning/burn-export-types";

type AnyDb = Awaited<ReturnType<typeof getDbClient>> | ServiceDbClient;

export async function listBurnedExportsForJob(
  jobId: string,
  db?: AnyDb,
): Promise<CaptionBurnedExportRow[]> {
  const supabase = db ?? (await getDbClient());
  const { data, error } = await supabase
    .from("caption_burned_exports")
    .select("*")
    .eq("job_id", jobId)
    .order("lang", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CaptionBurnedExportRow[];
}

export async function getBurnedExport(
  jobId: string,
  lang: string,
  resolution: string = BURN_EXPORT_RESOLUTION,
  db?: AnyDb,
): Promise<CaptionBurnedExportRow | null> {
  const supabase = db ?? (await getDbClient());
  const { data, error } = await supabase
    .from("caption_burned_exports")
    .select("*")
    .eq("job_id", jobId)
    .eq("lang", lang)
    .eq("resolution", resolution)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CaptionBurnedExportRow | null;
}

export async function upsertBurnedExportQueued(
  db: ServiceDbClient,
  input: {
    jobId: string;
    lang: string;
    resolution?: string;
    sourceVideoPath: string;
    cuesFingerprint: string;
    force?: boolean;
  },
): Promise<CaptionBurnedExportRow> {
  const resolution = input.resolution ?? BURN_EXPORT_RESOLUTION;
  const existing = await getBurnedExport(input.jobId, input.lang, resolution, db);

  if (
    existing &&
    !input.force &&
    existing.status === "ready" &&
    existing.storage_path &&
    existing.source_video_path === input.sourceVideoPath &&
    existing.cues_fingerprint === input.cuesFingerprint
  ) {
    return existing;
  }

  if (existing && (existing.status === "queued" || existing.status === "rendering") && !input.force) {
    return existing;
  }

  const payload = {
    job_id: input.jobId,
    lang: input.lang,
    resolution,
    status: "queued" as const,
    fail_reason: null,
    request_id: null,
    endpoint: null,
    storage_path: input.force ? null : existing?.storage_path ?? null,
    source_video_path: input.sourceVideoPath,
    cues_fingerprint: input.cuesFingerprint,
    attempt_count: existing ? existing.attempt_count : 0,
  };

  const { data, error } = await db
    .from("caption_burned_exports")
    .upsert(payload, { onConflict: "job_id,lang,resolution" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CaptionBurnedExportRow;
}

export async function claimBurnedExportForRender(
  db: ServiceDbClient,
  exportId: string,
): Promise<CaptionBurnedExportRow | null> {
  const { data, error } = await db
    .from("caption_burned_exports")
    .update({
      status: "rendering",
      fail_reason: null,
      request_id: null,
      endpoint: null,
    })
    .eq("id", exportId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CaptionBurnedExportRow | null;
}

export async function setBurnedExportRequest(
  db: ServiceDbClient,
  exportId: string,
  input: { requestId: string; endpoint: string },
): Promise<void> {
  const { data: row } = await db
    .from("caption_burned_exports")
    .select("attempt_count")
    .eq("id", exportId)
    .maybeSingle();
  const next = (row?.attempt_count ?? 0) + 1;
  const { error } = await db
    .from("caption_burned_exports")
    .update({
      request_id: input.requestId,
      endpoint: input.endpoint,
      status: "rendering",
      attempt_count: next,
    })
    .eq("id", exportId);
  if (error) throw new Error(error.message);
}

export async function setBurnedExportReady(
  db: ServiceDbClient,
  exportId: string,
  input: { storagePath: string; storageBucket: string },
): Promise<void> {
  const { error } = await db
    .from("caption_burned_exports")
    .update({
      status: "ready",
      fail_reason: null,
      storage_path: input.storagePath,
      storage_bucket: input.storageBucket,
    })
    .eq("id", exportId);
  if (error) throw new Error(error.message);
}

export async function setBurnedExportFailed(
  db: ServiceDbClient,
  exportId: string,
  reason: string,
): Promise<void> {
  const { error } = await db
    .from("caption_burned_exports")
    .update({
      status: "failed",
      fail_reason: reason,
    })
    .eq("id", exportId);
  if (error) throw new Error(error.message);
}

export async function listProcessingBurnedExports(
  db: ServiceDbClient,
): Promise<CaptionBurnedExportRow[]> {
  const { data, error } = await db
    .from("caption_burned_exports")
    .select("*")
    .in("status", ["queued", "rendering"])
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as CaptionBurnedExportRow[];
}

export async function getBurnedExportById(
  db: ServiceDbClient,
  exportId: string,
): Promise<CaptionBurnedExportRow | null> {
  const { data, error } = await db
    .from("caption_burned_exports")
    .select("*")
    .eq("id", exportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as CaptionBurnedExportRow | null;
}

export type { BurnExportStatus, CaptionBurnedExportRow };
