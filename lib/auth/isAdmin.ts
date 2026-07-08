import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { ServiceDbClient } from "@/lib/db/service-client";

/**
 * Server-only admin check — never trust client-sent flags.
 * Pass `db` (service-role client) from detached/background tasks that have no
 * request scope; otherwise the request-scoped client (cookies) is used.
 */
export async function isAdmin(
  userId: string,
  db?: ServiceDbClient,
): Promise<boolean> {
  const supabase = db ?? (await getDbClient());
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return Boolean(data.is_admin);
}
