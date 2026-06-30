#!/usr/bin/env node
/**
 * Live metering tests against Supabase (service role).
 * Usage: npm run test:metering
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
  if (error) throw new Error(error.message);
  return { available: data?.available ?? 0, reserved: data?.reserved ?? 0 };
}

async function withCredits(admin, userId, estimate, reference, fn) {
  const { data: reservationId, error: reserveError } = await admin.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: estimate,
    p_reference: reference,
    p_metadata: {},
  });
  if (reserveError) {
    const balance = await readBalance(admin, userId);
    const err = new Error(reserveError.message);
    err.needed = estimate;
    err.available = balance.available;
    throw err;
  }

  try {
    const { actualCredits } = await fn();
    await admin.rpc("commit_reservation", {
      p_reservation_id: reservationId,
      p_actual_amount: actualCredits,
    });
  } catch (error) {
    await admin.rpc("release_reservation", { p_reservation_id: reservationId });
    throw error;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.TEST_CREDITS_USER_ID || process.env.DEV_USER_ID;

if (!url || !serviceKey || !userId) {
  console.error("Missing Supabase env or TEST_CREDITS_USER_ID / DEV_USER_ID");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("Credit metering test (live Postgres)");
console.log("user_id:", userId);
console.log("---");

const start = await readBalance(admin, userId);
console.log(`Start: available=${start.available}, reserved=${start.reserved}`);

// Ensure enough credits for success test
if (start.available < 50) {
  await admin.rpc("grant_credits", {
    p_user_id: userId,
    p_amount: 200,
    p_type: "grant",
    p_reference: "test:metering-setup",
    p_metadata: { test: true },
  });
}

const afterGrant = await readBalance(admin, userId);
console.log(`Funded: available=${afterGrant.available}, reserved=${afterGrant.reserved}`);

const estimate = 40;
const actual = 35;
const beforeSuccess = await readBalance(admin, userId);

await withCredits(admin, userId, estimate, "test:metering:success", async () => {
  return { actualCredits: actual };
});

const afterSuccess = await readBalance(admin, userId);
const spent = beforeSuccess.available - afterSuccess.available;
console.log(
  `✓ Successful job: reserved=${afterSuccess.reserved} (expect 0), spent=${spent} (expect ${actual})`,
);
if (afterSuccess.reserved !== 0 || spent !== actual) process.exit(1);

const beforeFail = await readBalance(admin, userId);
let failReserveId = null;
try {
  const { data, error } = await admin.rpc("reserve_credits", {
    p_user_id: userId,
    p_amount: 25,
    p_reference: "test:metering:fail",
    p_metadata: {},
  });
  if (error) throw error;
  failReserveId = data;
  throw new Error("provider_failed");
} catch (error) {
  if (failReserveId) {
    await admin.rpc("release_reservation", { p_reservation_id: failReserveId });
  }
}

const afterFail = await readBalance(admin, userId);
console.log(
  `✓ Failed job restored: available ${beforeFail.available} → ${afterFail.available} (unchanged)`,
);
if (afterFail.available !== beforeFail.available || afterFail.reserved !== 0) process.exit(1);

const beforeBlock = await readBalance(admin, userId);
const { error: overspendError } = await admin.rpc("reserve_credits", {
  p_user_id: userId,
  p_amount: 999_999,
  p_reference: "test:metering:blocked",
  p_metadata: {},
});

if (overspendError) {
  console.log(`✓ Insufficient balance blocked: ${overspendError.message}`);
} else {
  console.error("✗ Overspend reservation should have failed");
  process.exit(1);
}

const afterBlock = await readBalance(admin, userId);
console.log(
  `✓ Balance unchanged after block: available=${afterBlock.available} (was ${beforeBlock.available})`,
);
if (afterBlock.available !== beforeBlock.available) process.exit(1);

console.log("---");
console.log("All metering checks passed.");
