-- Security: credit-moving RPCs must be callable only by service_role (server code).
-- Apply manually in Supabase SQL Editor.
--
-- FLAG: run this migration before deploying server changes that route reserve_credits
-- through the service-role client (lib/credits/mutations.ts).

BEGIN;

REVOKE ALL ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT, JSONB) TO service_role;

COMMIT;
