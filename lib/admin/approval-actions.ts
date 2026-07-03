"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { setApprovalStatus } from "@/lib/admin/approvals";

export async function approveUserAction(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { ok: false, error: "Cannot approve your own account." };
    }
    await setApprovalStatus({
      userId,
      status: "approved",
      approvedBy: admin.id,
    });
    revalidatePath("/admin/approvals");
    revalidatePath("/admin/usage");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Approval failed.",
    };
  }
}

export async function rejectUserAction(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { ok: false, error: "Cannot reject your own account." };
    }
    await setApprovalStatus({
      userId,
      status: "rejected",
      approvedBy: admin.id,
    });
    revalidatePath("/admin/approvals");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Rejection failed.",
    };
  }
}
