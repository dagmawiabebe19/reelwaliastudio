import "server-only";

import { redirect } from "next/navigation";
import { isDevAuthBypassActive } from "@/lib/auth/bypass";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
};

function devBypassUser(): SessionUser {
  const id = process.env.DEV_USER_ID?.trim();
  if (!id) {
    throw new Error("DEV_NO_AUTH is enabled but DEV_USER_ID is not set.");
  }
  return { id, email: `dev:${id}` };
}

/** Authenticated user from Supabase session, or dev bypass user in local dev only. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDevAuthBypassActive()) {
    return devBypassUser();
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return { id: user.id, email: user.email ?? null };
}

/** Server guard — redirects to /login when there is no authenticated user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Throws when unauthenticated (for server actions / APIs). */
export async function getActiveUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user.id;
}
