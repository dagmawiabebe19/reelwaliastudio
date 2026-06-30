import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { CreditLedgerEntry } from "@/lib/credits/types";

export async function getLedgerHistory(
  userId: string,
  limit = 50,
): Promise<CreditLedgerEntry[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("credit_ledger")
    .select(
      "id, user_id, amount, balance_after, type, status, reservation_id, reference, metadata, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("credit_ledger")) {
      return [];
    }
    throw new Error(`Failed to load credit ledger: ${error.message}`);
  }

  return (data ?? []) as CreditLedgerEntry[];
}
