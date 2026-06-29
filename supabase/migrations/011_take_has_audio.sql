-- Whether a video take includes native generated audio (e.g. Seedance 2.0).
ALTER TABLE public.takes
  ADD COLUMN IF NOT EXISTS has_audio BOOLEAN;
