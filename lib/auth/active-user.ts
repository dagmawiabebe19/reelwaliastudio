import "server-only";

import { isDevNoAuth } from "@/lib/auth/dev";
import { createClient } from "@/lib/supabase/server";

export async function getActiveUserId(): Promise<string> {
  if (isDevNoAuth()) {
    const devUserId = process.env.DEV_USER_ID;
    if (!devUserId) {
      throw new Error("DEV_NO_AUTH is enabled but DEV_USER_ID is not set.");
    }
    return devUserId;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated");
  }

  return user.id;
}
