-- Persistent co-pilot series memory (world facts + decisions/preferences log)
BEGIN;

ALTER TABLE public.series
  ADD COLUMN IF NOT EXISTS memory_markdown TEXT NOT NULL DEFAULT '';

COMMIT;
