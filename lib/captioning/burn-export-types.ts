/** Shared caption burn-export constants/types (safe for client + server). */

export const BURN_EXPORT_RESOLUTION = "720p" as const;

export type BurnExportStatus = "queued" | "rendering" | "ready" | "failed";

export type CaptionBurnedExportRow = {
  id: string;
  job_id: string;
  lang: string;
  resolution: string;
  status: BurnExportStatus;
  fail_reason: string | null;
  request_id: string | null;
  endpoint: string | null;
  storage_bucket: string;
  storage_path: string | null;
  source_video_path: string;
  cues_fingerprint: string;
  attempt_count: number;
  created_at: string;
  updated_at: string;
};
