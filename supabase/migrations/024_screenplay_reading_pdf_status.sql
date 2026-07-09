-- Screenplay import: reading_pdf status for PDF text-extraction phase.
-- FLAG: apply manually in the STUDIO Supabase SQL Editor — do not auto-run.

BEGIN;

ALTER TABLE public.screenplays DROP CONSTRAINT IF EXISTS screenplays_status_check;

ALTER TABLE public.screenplays
  ADD CONSTRAINT screenplays_status_check
  CHECK (status IN ('uploaded', 'reading_pdf', 'parsing', 'parsed', 'failed'));

DROP INDEX IF EXISTS screenplays_status_idx;
CREATE INDEX IF NOT EXISTS screenplays_status_idx ON public.screenplays (status)
  WHERE status IN ('uploaded', 'reading_pdf', 'parsing');

COMMIT;
