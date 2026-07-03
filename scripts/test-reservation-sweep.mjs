#!/usr/bin/env node
/**
 * Verify abandoned non-video reservation sweep (conservative release).
 *
 * Usage: node scripts/test-reservation-sweep.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_USER_ID
 */

import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
import { readFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function readBalance(admin, userId) {
  const { data, error } = await admin
    .from("credit_balances")
    .select("available, reserved")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return { available: data?.available ?? 0, reserved: data?.reserved ?? 0 };
}

async function countOpenNonVideoReservations(admin) {
  const { data, error } = await admin
    .from("credit_ledger")
    .select("reservation_id, reference, created_at, status")
    .eq("type", "reservation")
    .eq("status", "reserved")
    .not("reservation_id", "is", null);
  if (error) throw error;

  const seen = new Set();
  let count = 0;
  for (const row of data ?? []) {
    if (!row.reservation_id || seen.has(row.reservation_id)) continue;
    seen.add(row.reservation_id);
    const ref = row.reference ?? "";
    if (/^seedance:take:/i.test(ref)) continue;
    const ageH = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
    if (ageH >= 24) count += 1;
  }
  return count;
}

async function isOpen(admin, reservationId) {
  const { data, error } = await admin.rpc("credit_reservation_is_open", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  return Boolean(data);
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.TEST_CREDITS_USER_ID || process.env.DEV_USER_ID;

if (!url || !serviceKey || !userId) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_USER_ID");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const jiti = createJiti(import.meta.url);
const { reconcileStuckReservationsCore } = await jiti.import(
  "../lib/credits/reservation-sweep-core.ts",
);

async function releaseReservation(reservationId) {
  const { error } = await admin.rpc("release_reservation", {
    p_reservation_id: reservationId,
  });
  if (error) throw new Error(error.message);
}

async function isReservationOpenRpc(reservationId) {
  const { data, error } = await admin.rpc("credit_reservation_is_open", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  return Boolean(data);
}

async function reconcileStuckReservations(input) {
  return reconcileStuckReservationsCore({
    db: input.ops.db,
    releaseReservation,
    isReservationOpen: isReservationOpenRpc,
  });
}

console.log("=== Reservation sweep verification ===\n");

const orphansBefore = await countOpenNonVideoReservations(admin);
const balancesBefore = await readBalance(admin, userId);
console.log(`Orphan reservations (>24h, non-video): ${orphansBefore}`);
console.log(`Test user balance before sweep: available=${balancesBefore.available} reserved=${balancesBefore.reserved}`);

const sweepBefore = await reconcileStuckReservations({ ops: { db: admin } });
console.log(
  `\nSweep pass 1: released ${sweepBefore.released} (image:${sweepBefore.byKind.ingredient} sheet:${sweepBefore.byKind.sheet} copilot:${sweepBefore.byKind.copilot} summary:${sweepBefore.byKind.episode_summary})`,
);

const orphansAfter = await countOpenNonVideoReservations(admin);
const balancesAfterSweep = await readBalance(admin, userId);
console.log(`Orphan reservations after sweep: ${orphansAfter}`);
console.log(`Test user balance after sweep: available=${balancesAfterSweep.available} reserved=${balancesAfterSweep.reserved}`);

const fakeSheetId = randomUUID();
const freshRef = `openai-image:sheet:${fakeSheetId}`;
const { data: freshReservationId, error: reserveError } = await admin.rpc("reserve_credits", {
  p_user_id: userId,
  p_amount: 5,
  p_reference: freshRef,
  p_metadata: {},
});
if (reserveError) throw reserveError;

const freshOpenBefore = await isOpen(admin, String(freshReservationId));
const sweepFresh = await reconcileStuckReservations({ ops: { db: admin } });
const freshOpenAfter = await isOpen(admin, String(freshReservationId));

if (!freshOpenBefore) {
  console.error("✗ Fresh reservation should be open before sweep");
  process.exit(1);
}
if (!freshOpenAfter) {
  console.error("✗ Fresh reservation was incorrectly released by sweep");
  process.exit(1);
}
if (sweepFresh.released > 0 && sweepFresh.outcomes.some((o) => o.reservationId === String(freshReservationId))) {
  console.error("✗ Sweep released a fresh reservation");
  process.exit(1);
}
console.log("\n✓ Fresh reservation (within threshold) was NOT released");

await admin.rpc("release_reservation", { p_reservation_id: String(freshReservationId) });

const abandonedSheetId = randomUUID();
const abandonedRef = `openai-image:sheet:${abandonedSheetId}`;
const { data: abandonedId, error: abandonedReserveError } = await admin.rpc("reserve_credits", {
  p_user_id: userId,
  p_amount: 7,
  p_reference: abandonedRef,
  p_metadata: {},
});
if (abandonedReserveError) throw abandonedReserveError;

const backdatedAt = new Date(Date.now() - 30 * 60_000).toISOString();
const { error: backdateError } = await admin
  .from("credit_ledger")
  .update({ created_at: backdatedAt })
  .eq("reservation_id", String(abandonedId))
  .eq("type", "reservation");
if (backdateError) throw backdateError;

const balanceBeforeAbandoned = await readBalance(admin, userId);
await reconcileStuckReservations({ ops: { db: admin } });
const abandonedOpenAfter = await isOpen(admin, String(abandonedId));
const balanceAfterAbandoned = await readBalance(admin, userId);

if (abandonedOpenAfter) {
  console.error("✗ Backdated abandoned reservation should have been released");
  process.exit(1);
}
if (balanceAfterAbandoned.reserved >= balanceBeforeAbandoned.reserved) {
  console.error("✗ Reserved balance should drop after releasing abandoned reservation");
  process.exit(1);
}
console.log("✓ Backdated abandoned reservation was released; reserved balance dropped");

const sweepIdempotent = await reconcileStuckReservations({ ops: { db: admin } });
if (
  sweepIdempotent.outcomes.some(
    (o) => o.reservationId === String(abandonedId) && o.result === "released",
  )
) {
  console.error("✗ Idempotent sweep attempted double-release");
  process.exit(1);
}
console.log("✓ Second sweep did not double-release");

console.log("\nAll reservation sweep checks passed.");
