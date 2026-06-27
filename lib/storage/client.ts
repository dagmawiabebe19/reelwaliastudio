import "server-only";

import { isDevNoAuth } from "@/lib/auth/dev";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getStorageClient() {
  if (isDevNoAuth()) {
    return createAdminClient();
  }
  return createClient();
}
