import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { grantCredits } from "@/lib/credits/mutations";
import { SIGNUP_CREDIT_GRANT_AMOUNT } from "@/lib/credits/constants";
import type { ApprovalStatus } from "@/lib/auth/approval";

export type PendingApprovalAccount = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
};

export async function listPendingApprovalAccounts(): Promise<PendingApprovalAccount[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, created_at")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`listPendingApprovalAccounts failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  }));
}

export async function countPendingApprovals(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("approval_status", "pending");

  if (error) {
    throw new Error(`countPendingApprovals failed: ${error.message}`);
  }

  return count ?? 0;
}

async function hasWelcomeGrant(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("reference", "signup:welcome")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`hasWelcomeGrant failed: ${error.message}`);
  }

  return Boolean(data);
}

export async function setApprovalStatus(input: {
  userId: string;
  status: Extract<ApprovalStatus, "approved" | "rejected">;
  approvedBy: string;
}): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const patch =
    input.status === "approved"
      ? {
          approval_status: "approved" as const,
          approved_at: now,
          approved_by: input.approvedBy,
        }
      : {
          approval_status: "rejected" as const,
          approved_at: null,
          approved_by: input.approvedBy,
        };

  const { error } = await admin.from("profiles").update(patch).eq("id", input.userId);

  if (error) {
    throw new Error(`setApprovalStatus failed: ${error.message}`);
  }

  if (input.status === "approved" && !(await hasWelcomeGrant(input.userId))) {
    await grantCredits(input.userId, SIGNUP_CREDIT_GRANT_AMOUNT, "grant", "signup:welcome", {
      reason: "admin_approval",
      approved_by: input.approvedBy,
    });
  }
}
