-- Optional dev profile seed for DEV_USER_ID (local dev with DEV_NO_AUTH=true)
-- Safe to re-run. Requires auth.users row OR disable FK temporarily in local-only setups.
-- For Supabase local: insert into auth.users first, or use a real signed-in user's UUID.

BEGIN;

INSERT INTO public.profiles (id, display_name, email)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Dev User',
  'dev@reelwalia.local'
)
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email;

COMMIT;
