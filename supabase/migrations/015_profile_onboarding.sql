-- FLAG: apply manually in Supabase SQL Editor — do not auto-run.
-- First-run onboarding flag (persists across devices; no browser storage).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.has_completed_onboarding IS
  'User dismissed or finished first-run guidance. Writable by the user via RLS update.';

-- Existing users with projects or series are treated as already onboarded.
UPDATE public.profiles p
SET has_completed_onboarding = true
WHERE has_completed_onboarding = false
  AND (
    EXISTS (SELECT 1 FROM public.projects pr WHERE pr.owner_id = p.id)
    OR EXISTS (
      SELECT 1
      FROM public.series s
      INNER JOIN public.projects pr ON pr.id = s.project_id
      WHERE pr.owner_id = p.id
    )
  );
