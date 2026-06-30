import "server-only";

import { isDevAuthBypassActive } from "@/lib/auth/bypass";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** User-scoped Postgres client — ANON key + session cookies; RLS applies. */
export async function getDbClient() {
  if (isDevAuthBypassActive()) {
    console.warn(
      "[auth] DEV_NO_AUTH: using service-role DB client (RLS bypassed). Local dev only — use magic-link login instead when possible.",
    );
    return createAdminClient();
  }
  return createClient();
}
