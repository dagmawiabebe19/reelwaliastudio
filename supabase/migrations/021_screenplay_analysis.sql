-- Screenplay LLM analysis proposal storage.
-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.

BEGIN;

ALTER TABLE public.screenplays
  ADD COLUMN IF NOT EXISTS analysis_status TEXT CHECK (
    analysis_status IN ('analyzing', 'proposed', 'failed', 'approved')
  );

ALTER TABLE public.screenplays
  ADD COLUMN IF NOT EXISTS analysis_proposal JSONB;

ALTER TABLE public.screenplays
  ADD COLUMN IF NOT EXISTS analysis_fail_reason TEXT;

COMMENT ON COLUMN public.screenplays.analysis_status IS
  'LLM breakdown lifecycle: analyzing → proposed → approved (or failed).';

COMMENT ON COLUMN public.screenplays.analysis_proposal IS
  'Structured breakdown proposal (characters, locations, episode structures). User approves selections.';

COMMIT;
