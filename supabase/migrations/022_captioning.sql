-- Captioning tool: upload finished episode video, transcribe actual audio,
-- review English, translate to target languages, export VTT.
-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.captioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  episode_id UUID REFERENCES public.episodes (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  video_bucket TEXT NOT NULL DEFAULT 'captioning',
  video_storage_path TEXT NOT NULL,
  duration_seconds NUMERIC,
  source_lang TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'transcribing', 'transcribed', 'translating', 'ready', 'failed')
  ),
  fail_reason TEXT,
  english_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS captioning_jobs_owner_idx
  ON public.captioning_jobs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS captioning_jobs_status_idx
  ON public.captioning_jobs (status)
  WHERE status IN ('uploaded', 'transcribing', 'translating');

-- Per-language, per-cue text. lang='en' is the (editable) transcription source.
CREATE TABLE IF NOT EXISTS public.caption_cues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.captioning_jobs (id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  cue_index INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, lang, cue_index)
);

CREATE INDEX IF NOT EXISTS caption_cues_job_lang_idx
  ON public.caption_cues (job_id, lang, cue_index);

-- Per target-language translation status (drives per-language regenerate).
CREATE TABLE IF NOT EXISTS public.caption_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.captioning_jobs (id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'translating', 'ready', 'failed')
  ),
  fail_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, lang)
);

CREATE INDEX IF NOT EXISTS caption_translations_job_idx
  ON public.caption_translations (job_id);
CREATE INDEX IF NOT EXISTS caption_translations_status_idx
  ON public.caption_translations (status)
  WHERE status IN ('pending', 'translating');

-- updated_at trigger (reuse shared helper if present).
DROP TRIGGER IF EXISTS captioning_jobs_updated_at ON public.captioning_jobs;
CREATE TRIGGER captioning_jobs_updated_at
  BEFORE UPDATE ON public.captioning_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS caption_translations_updated_at ON public.caption_translations;
CREATE TRIGGER caption_translations_updated_at
  BEFORE UPDATE ON public.caption_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (owner-only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.captioning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caption_cues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caption_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage captioning jobs" ON public.captioning_jobs;
CREATE POLICY "Owners manage captioning jobs"
  ON public.captioning_jobs
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage caption cues" ON public.caption_cues;
CREATE POLICY "Owners manage caption cues"
  ON public.caption_cues
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.captioning_jobs j
      WHERE j.id = job_id AND j.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.captioning_jobs j
      WHERE j.id = job_id AND j.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners manage caption translations" ON public.caption_translations;
CREATE POLICY "Owners manage caption translations"
  ON public.caption_translations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.captioning_jobs j
      WHERE j.id = job_id AND j.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.captioning_jobs j
      WHERE j.id = job_id AND j.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage bucket for finished episode video + generated caption files
-- Path convention: {owner_id}/{job_id}/source.<ext> and {owner_id}/{job_id}/captions/<lang>.vtt
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('captioning', 'captioning', false, 524288000)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Owners insert captioning objects" ON storage.objects;
CREATE POLICY "Owners insert captioning objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'captioning'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners select captioning objects" ON storage.objects;
CREATE POLICY "Owners select captioning objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'captioning'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners update captioning objects" ON storage.objects;
CREATE POLICY "Owners update captioning objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'captioning'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'captioning'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Owners delete captioning objects" ON storage.objects;
CREATE POLICY "Owners delete captioning objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'captioning'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
