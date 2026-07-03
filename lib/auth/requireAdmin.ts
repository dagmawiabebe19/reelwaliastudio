import "server-only";

import { notFound } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";

/** Server-only admin gate — non-admins get 404 (no route leak). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) {
    notFound();
  }
  return user;
}
