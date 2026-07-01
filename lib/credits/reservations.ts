import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type OpenCreditReservation = {
  reservationId: string;
  userId: string;
  heldAmount: number;
  reference: string | null;
  createdAt: string;
};

export async function findOpenReservationByReference(
  reference: string,
): Promise<OpenCreditReservation | null> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("credit_ledger")
    .select("reservation_id, user_id, amount, reference, created_at, type, status")
    .eq("reference", reference)
    .eq("type", "reservation")
    .eq("status", "reserved")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(`findOpenReservationByReference failed: ${error.message}`);
  if (!rows?.length) return null;

  for (const row of rows) {
    if (!row.reservation_id) continue;
    const { data: open, error: openError } = await admin.rpc("credit_reservation_is_open", {
      p_reservation_id: row.reservation_id,
    });
    if (openError) throw new Error(`credit_reservation_is_open failed: ${openError.message}`);
    if (!open) continue;

    return {
      reservationId: row.reservation_id,
      userId: row.user_id,
      heldAmount: Math.abs(row.amount),
      reference: row.reference,
      createdAt: row.created_at,
    };
  }

  return null;
}

export async function isReservationOpen(reservationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("credit_reservation_is_open", {
    p_reservation_id: reservationId,
  });
  if (error) throw new Error(`credit_reservation_is_open failed: ${error.message}`);
  return Boolean(data);
}
