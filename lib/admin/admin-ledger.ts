import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CreditLedgerEntry } from "@/lib/credits/types";

export async function getAdminLedgerHistory(
  userId: string,
  limit = 100,
): Promise<CreditLedgerEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("credit_ledger")
    .select(
      "id, user_id, amount, balance_after, type, status, reservation_id, reference, metadata, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load ledger for user: ${error.message}`);
  }

  return (data ?? []) as CreditLedgerEntry[];
}

export async function getAdminProfileEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  return data?.email ?? null;
}
