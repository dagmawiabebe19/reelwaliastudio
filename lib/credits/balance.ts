import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { ServiceDbClient } from "@/lib/db/service-client";
import type { CreditBalance } from "@/lib/credits/types";

const EMPTY_BALANCE: CreditBalance = { available: 0, reserved: 0 };

/**
 * Pass `db` (service-role client) from detached/background tasks that have no
 * request scope; otherwise the request-scoped client (cookies) is used.
 */
export async function getBalance(
  userId: string,
  db?: ServiceDbClient,
): Promise<CreditBalance> {
  const supabase = db ?? (await getDbClient());
  const { data, error } = await supabase
    .from("credit_balances")
    .select("available, reserved")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("credit_balances")) {
      return EMPTY_BALANCE;
    }
    throw new Error(`Failed to load credit balance: ${error.message}`);
  }

  if (!data) {
    return EMPTY_BALANCE;
  }

  return {
    available: data.available,
    reserved: data.reserved,
  };
}
