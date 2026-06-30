import "server-only";

import { createClient } from "@/lib/supabase/server";

/** User-scoped storage client — ANON key + session cookies; storage RLS applies. */
export async function getStorageClient() {
  return createClient();
}
