#!/usr/bin/env node
/**
 * Exercises credit RPC lifecycle against Supabase (service role).
 * Usage: npm run test:credits
 * Requires: migration 012_credits.sql applied; TEST_CREDITS_USER_ID or DEV_USER_ID in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

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
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local optional if env vars already set
  }
}

function assertBalance(label, actual, expected) {
  const ok =
    actual.available === expected.available && actual.reserved === expected.reserved;
  console.log(
    `${ok ? "✓" : "✗"} ${label}: available=${actual.available}, reserved=${actual.reserved}` +
      (ok ? "" : ` (expected available=${expected.available}, reserved=${expected.reserved})`),
  );
  if (!ok) {
    process.exit(1);
  }
}

async function readBalance(admin, userId) {
  const { data, error } = await admin
    .from("credit_balances")
    .select("available, reserved")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`read balance failed: ${error.message}`);
  }

  return {
    available: data?.available ?? 0,
    reserved: data?.reserved ?? 0,
  };
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.TEST_CREDITS_USER_ID || process.env.DEV_USER_ID;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!userId) {
  console.error("Set TEST_CREDITS_USER_ID or DEV_USER_ID in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("Credit lifecycle test");
console.log("user_id:", userId);
console.log("---");

const start = await readBalance(admin, userId);
console.log(`Starting balance: available=${start.available}, reserved=${start.reserved}`);

if (start.available !== 0 || start.reserved !== 0) {
  console.log(
    "Note: balance is not zero — grant/reserve steps assume a fresh test user (0 credits).",
  );
}

const { error: grantError } = await admin.rpc("grant_credits", {
  p_user_id: userId,
  p_amount: 100,
  p_type: "grant",
  p_reference: "test:initial-grant",
  p_metadata: { test: true },
});

if (grantError) {
  console.error("grant_credits failed:", grantError.message);
  process.exit(1);
}

let balance = await readBalance(admin, userId);
assertBalance("After grant 100", balance, {
  available: start.available + 100,
  reserved: start.reserved,
});

const { data: reservationId, error: reserveError } = await admin.rpc("reserve_credits", {
  p_user_id: userId,
  p_amount: 40,
  p_reference: "test:reserve-40",
  p_metadata: {},
});

if (reserveError) {
  console.error("reserve_credits failed:", reserveError.message);
  process.exit(1);
}

balance = await readBalance(admin, userId);
assertBalance("After reserve 40", balance, {
  available: start.available + 60,
  reserved: start.reserved + 40,
});

const { error: commitError } = await admin.rpc("commit_reservation", {
  p_reservation_id: reservationId,
  p_actual_amount: 35,
});

if (commitError) {
  console.error("commit_reservation failed:", commitError.message);
  process.exit(1);
}

balance = await readBalance(admin, userId);
assertBalance("After commit actual 35", balance, {
  available: start.available + 65,
  reserved: start.reserved,
});

const { data: reservationId2, error: reserve2Error } = await admin.rpc("reserve_credits", {
  p_user_id: userId,
  p_amount: 30,
  p_reference: "test:reserve-30",
  p_metadata: {},
});

if (reserve2Error) {
  console.error("reserve_credits (30) failed:", reserve2Error.message);
  process.exit(1);
}

balance = await readBalance(admin, userId);
assertBalance("After reserve 30", balance, {
  available: start.available + 35,
  reserved: start.reserved + 30,
});

const { error: releaseError } = await admin.rpc("release_reservation", {
  p_reservation_id: reservationId2,
});

if (releaseError) {
  console.error("release_reservation failed:", releaseError.message);
  process.exit(1);
}

balance = await readBalance(admin, userId);
assertBalance("After release 30", balance, {
  available: start.available + 65,
  reserved: start.reserved,
});

const { error: overspendError } = await admin.rpc("reserve_credits", {
  p_user_id: userId,
  p_amount: 999,
  p_reference: "test:overspend",
  p_metadata: {},
});

if (!overspendError) {
  console.error("✗ reserve 999 should have failed but succeeded");
  process.exit(1);
}

console.log(`✓ reserve 999 rejected: ${overspendError.message}`);

// Idempotency: re-commit and re-release should no-op
await admin.rpc("commit_reservation", {
  p_reservation_id: reservationId,
  p_actual_amount: 35,
});
await admin.rpc("release_reservation", { p_reservation_id: reservationId2 });

balance = await readBalance(admin, userId);
assertBalance("After idempotent re-commit/re-release", balance, {
  available: start.available + 65,
  reserved: start.reserved,
});

console.log("---");
console.log("All credit lifecycle checks passed.");
