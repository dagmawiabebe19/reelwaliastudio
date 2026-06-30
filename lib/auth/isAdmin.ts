import "server-only";

import { getDbClient } from "@/lib/db/client";

/** Server-only admin check — never trust client-sent flags. */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = await getDbClient();
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
