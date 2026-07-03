import "server-only";

import { redirect } from "next/navigation";
import { getDbClient } from "@/lib/db/client";
import {
  isOwnerAccount,
  type ApprovalStatus,
  type UserApprovalProfile,
} from "@/lib/auth/approval";
import { isAdmin } from "@/lib/auth/isAdmin";
import { requireUser, type SessionUser } from "@/lib/auth/getUser";

export async function getUserApprovalProfile(userId: string): Promise<UserApprovalProfile> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("approval_status, is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserApprovalProfile failed: ${error.message}`);
  }

  const approvalStatus = (data?.approval_status ?? "pending") as ApprovalStatus;
  return {
    approvalStatus,
    isAdmin: Boolean(data?.is_admin),
  };
}

/**
 * Gate for the authenticated app layout. Admins and owner bypass unconditionally.
 * Non-admins must have approval_status = 'approved'.
 * If approval read fails, admins still get in (fail-open for admins only).
 */
export async function requireApprovedAppAccess(): Promise<SessionUser> {
  const user = await requireUser();

  if (isOwnerAccount(user)) {
    return user;
  }

  let adminBypass = false;
  try {
    adminBypass = await isAdmin(user.id);
  } catch {
    adminBypass = false;
  }
  if (adminBypass) {
    return user;
  }

  try {
    const profile = await getUserApprovalProfile(user.id);
    if (profile.isAdmin) {
      return user;
    }
    if (profile.approvalStatus === "approved") {
      return user;
    }
  } catch {
    try {
      if (await isAdmin(user.id)) {
        return user;
      }
    } catch {
      if (isOwnerAccount(user)) {
        return user;
      }
    }
    redirect("/pending");
  }

  redirect("/pending");
}
