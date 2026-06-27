-- Generation engine: take status extensions + episode export jobs

BEGIN;

DO $$
BEGIN
  ALTER TYPE public.take_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.take_status ADD VALUE IF NOT EXISTS 'failed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.takes
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE TABLE IF NOT EXISTS public.episode_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.episodes (id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_exports_episode_id ON public.episode_exports (episode_id);

DROP TRIGGER IF EXISTS set_episode_exports_updated_at ON public.episode_exports;
CREATE TRIGGER set_episode_exports_updated_at
  BEFORE UPDATE ON public.episode_exports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.episode_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage episode exports via episode" ON public.episode_exports;
CREATE POLICY "Owners manage episode exports via episode"
  ON public.episode_exports
  FOR ALL
  TO authenticated
  USING (public.user_owns_episode(episode_id))
  WITH CHECK (public.user_owns_episode(episode_id));

COMMIT;
