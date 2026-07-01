-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.
-- Per-episode plot/state summary for automatic cross-episode co-pilot continuity.

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS summary_markdown text;

COMMENT ON COLUMN episodes.summary_markdown IS
  'Short running summary of this episode (plot beats, state, key assets) — injected into later episodes co-pilot context. Not a chat transcript.';
