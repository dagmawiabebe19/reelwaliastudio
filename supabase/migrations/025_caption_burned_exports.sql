-- Captioning: per-language burned-in 720p MP4 exports.
-- FLAG: apply manually in the STUDIO Supabase SQL Editor — do not auto-run.
-- File: supabase/migrations/025_caption_burned_exports.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.caption_burned_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.captioning_jobs (id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  resolution TEXT NOT NULL DEFAULT '720p',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'rendering', 'ready', 'failed')
  ),
  fail_reason TEXT,
  request_id TEXT,
  endpoint TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'captioning',
  storage_path TEXT,
  -- Idempotency fingerprints: skip re-render when source video + cues unchanged.
  source_video_path TEXT NOT NULL,
  cues_fingerprint TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, lang, resolution)
);

CREATE INDEX IF NOT EXISTS caption_burned_exports_job_idx
  ON public.caption_burned_exports (job_id);

CREATE INDEX IF NOT EXISTS caption_burned_exports_status_idx
  ON public.caption_burned_exports (status)
  WHERE status IN ('queued', 'rendering');

DROP TRIGGER IF EXISTS caption_burned_exports_updated_at ON public.caption_burned_exports;
CREATE TRIGGER caption_burned_exports_updated_at
  BEFORE UPDATE ON public.caption_burned_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.caption_burned_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage caption burned exports" ON public.caption_burned_exports;
CREATE POLICY "Owners manage caption burned exports"
  ON public.caption_burned_exports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.captioning_jobs j
      WHERE j.id = caption_burned_exports.job_id
        AND j.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.captioning_jobs j
      WHERE j.id = caption_burned_exports.job_id
        AND j.owner_id = auth.uid()
    )
  );

-- service_role bypasses RLS; revoke accidental PUBLIC grants on any helper later.
COMMIT;
