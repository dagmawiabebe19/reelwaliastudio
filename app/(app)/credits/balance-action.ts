"use server";

import { getActiveUserId } from "@/lib/auth/getUser";
import { isAdmin } from "@/lib/auth/isAdmin";
import { getBalance } from "@/lib/credits/balance";

export async function getMyCreditBalanceAction() {
  try {
    const userId = await getActiveUserId();
    const [balance, userIsAdmin] = await Promise.all([
      getBalance(userId),
      isAdmin(userId),
    ]);
    return { balance, isAdmin: userIsAdmin };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load balance.",
    };
  }
}
