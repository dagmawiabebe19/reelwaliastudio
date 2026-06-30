import "server-only";

import { isDevAuthBypassActive } from "@/lib/auth/bypass";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** User-scoped storage client — ANON key + session cookies; storage RLS applies. */
export async function getStorageClient() {
  if (isDevAuthBypassActive()) {
    console.warn(
      "[auth] DEV_NO_AUTH: using service-role storage client (RLS bypassed). Local dev only — use magic-link login instead when possible.",
    );
    return createAdminClient();
  }
  return createClient();
}
