import "server-only";

import { createClient } from "@/lib/supabase/server";

/** User-scoped Postgres client — ANON key + session cookies; RLS applies. */
export async function getDbClient() {
  return createClient();
}
