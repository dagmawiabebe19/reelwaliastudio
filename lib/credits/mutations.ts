import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getDbClient } from "@/lib/db/client";
import type { CreditLedgerType } from "@/lib/credits/types";

export async function grantCredits(
  userId: string,
  amount: number,
  type: Extract<CreditLedgerType, "purchase" | "grant" | "adjustment">,
  reference?: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("grant_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_reference: reference ?? null,
    p_metadata: metadata ?? {},
  });

  if (error) {
    throw new Error(`grant_credits failed: ${error.message}`);
  }

  return String(data);
}

export async function reserveCredits(
  userId: string,
  amount: number,
  reference?: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const supabase = await getDbClient();
  const { data, error } = await supabase.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reference: reference ?? null,
    p_metadata: metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }

  return String(data);
}

export async function commitReservation(
  reservationId: string,
  actualAmount: number,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("commit_reservation", {
    p_reservation_id: reservationId,
    p_actual_amount: actualAmount,
  });

  if (error) {
    throw new Error(`commit_reservation failed: ${error.message}`);
  }
}

export async function releaseReservation(reservationId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) {
    throw new Error(`release_reservation failed: ${error.message}`);
  }
}
