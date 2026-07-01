-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.
-- Persist fal queue request IDs so stuck takes can be reconciled after server restarts.

ALTER TABLE takes ADD COLUMN IF NOT EXISTS provider_request_id text;
ALTER TABLE takes ADD COLUMN IF NOT EXISTS provider_endpoint text;
ALTER TABLE takes ADD COLUMN IF NOT EXISTS provider_submitted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_takes_provider_request_id
  ON public.takes (provider_request_id)
  WHERE provider_request_id IS NOT NULL;

COMMENT ON COLUMN takes.provider_request_id IS
  'fal queue request_id — set at enqueue via onEnqueue for rescue/reconcile after watcher loss.';

COMMENT ON COLUMN takes.provider_endpoint IS
  'fal model endpoint used for this take (tier-specific Seedance path).';

COMMENT ON COLUMN takes.provider_submitted_at IS
  'When the fal queue job was enqueued.';
