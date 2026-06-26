-- Extend profiles with avatar_url (001 may already be applied)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
