-- Screenplay ingestion: upload metadata + deterministic parse output.
-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.screenplays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'fdx', 'fountain', 'txt')),
  storage_path TEXT NOT NULL,
  page_count_est INTEGER,
  scene_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'parsing', 'parsed', 'failed')
  ),
  fail_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS screenplays_series_id_idx ON public.screenplays (series_id);
CREATE INDEX IF NOT EXISTS screenplays_status_idx ON public.screenplays (status)
  WHERE status IN ('uploaded', 'parsing');

CREATE TABLE IF NOT EXISTS public.screenplay_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screenplay_id UUID NOT NULL REFERENCES public.screenplays (id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  slugline TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  int_ext TEXT NOT NULL DEFAULT '',
  time_of_day TEXT NOT NULL DEFAULT '',
  characters TEXT[] NOT NULL DEFAULT '{}',
  full_text TEXT NOT NULL,
  synopsis TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (screenplay_id, sort_order)
);

CREATE INDEX IF NOT EXISTS screenplay_scenes_screenplay_id_idx
  ON public.screenplay_scenes (screenplay_id, sort_order);

-- ---------------------------------------------------------------------------
-- RLS (owner-only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.screenplays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenplay_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage screenplays via series" ON public.screenplays;
CREATE POLICY "Owners manage screenplays via series"
  ON public.screenplays
  FOR ALL
  USING (owner_id = auth.uid() AND public.user_owns_series(series_id))
  WITH CHECK (owner_id = auth.uid() AND public.user_owns_series(series_id));

DROP POLICY IF EXISTS "Owners manage screenplay scenes via screenplay" ON public.screenplay_scenes;
CREATE POLICY "Owners manage screenplay scenes via screenplay"
  ON public.screenplay_scenes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.screenplays sp
      WHERE sp.id = screenplay_id
        AND sp.owner_id = auth.uid()
        AND public.user_owns_series(sp.series_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.screenplays sp
      WHERE sp.id = screenplay_id
        AND sp.owner_id = auth.uid()
        AND public.user_owns_series(sp.series_id)
    )
  );

COMMIT;
