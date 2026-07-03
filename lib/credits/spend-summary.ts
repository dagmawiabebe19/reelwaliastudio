import "server-only";

import { categorizeSpendReference } from "@/lib/admin/spend-category";
import { getDbClient } from "@/lib/db/client";

export type UserSpendByType = {
  video: number;
  images: number;
  copilot: number;
};

const MS_PER_DAY = 86_400_000;

export async function getSpendSummaryLast30Days(userId: string): Promise<UserSpendByType> {
  const since = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
  const supabase = await getDbClient();

  const { data, error } = await supabase
    .from("credit_ledger")
    .select("amount, type, status, reference")
    .eq("user_id", userId)
    .eq("type", "commit")
    .eq("status", "settled")
    .lt("amount", 0)
    .gte("created_at", since);

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("credit_ledger")) {
      return { video: 0, images: 0, copilot: 0 };
    }
    throw new Error(`Failed to load spend summary: ${error.message}`);
  }

  const summary: UserSpendByType = { video: 0, images: 0, copilot: 0 };

  for (const row of data ?? []) {
    const spent = Math.abs(row.amount);
    const category = categorizeSpendReference(row.reference);
    if (category === "video") summary.video += spent;
    else if (category === "copilot") summary.copilot += spent;
    else if (category === "image" || category === "sheet") summary.images += spent;
  }

  return summary;
}
