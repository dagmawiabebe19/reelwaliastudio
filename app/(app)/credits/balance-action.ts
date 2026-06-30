"use server";

import { getActiveUserId } from "@/lib/auth/getUser";
import { getBalance } from "@/lib/credits/balance";

export async function getMyCreditBalanceAction() {
  try {
    const userId = await getActiveUserId();
    return { balance: await getBalance(userId) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load balance.",
    };
  }
}
