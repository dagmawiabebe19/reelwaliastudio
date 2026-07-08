-- Captioning: burned-in (open-caption) English video output for social.
-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.

BEGIN;

ALTER TABLE public.captioning_jobs
  ADD COLUMN IF NOT EXISTS burn_status TEXT NOT NULL DEFAULT 'none' CHECK (
    burn_status IN ('none', 'processing', 'ready', 'failed')
  ),
  ADD COLUMN IF NOT EXISTS burn_fail_reason TEXT,
  ADD COLUMN IF NOT EXISTS burn_request_id TEXT,
  ADD COLUMN IF NOT EXISTS burn_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS burned_video_path TEXT;

-- Sweep target: recover interrupted burn jobs after a restart.
CREATE INDEX IF NOT EXISTS captioning_jobs_burn_status_idx
  ON public.captioning_jobs (burn_status)
  WHERE burn_status = 'processing';

COMMIT;
