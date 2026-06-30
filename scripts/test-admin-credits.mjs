#!/usr/bin/env node
/**
 * Admin credit exemption test (live Postgres).
 * Requires migration 013_admin_profiles.sql applied.
 * Usage: npm run test:admin-credits
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

async function countLedger(admin, userId, type) {
  const { count, error } = await admin
    .from("credit_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", type);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testUserId = process.env.TEST_CREDITS_USER_ID || process.env.DEV_USER_ID;

if (!url || !serviceKey || !testUserId) {
  console.error("Missing Supabase env or TEST_CREDITS_USER_ID / DEV_USER_ID");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("Admin credit exemption test");
console.log("user_id:", testUserId);
console.log("---");

const { data: profile, error: profileError } = await admin
  .from("profiles")
  .select("is_admin, email")
  .eq("id", testUserId)
  .maybeSingle();

if (profileError?.message?.includes("is_admin")) {
  console.error("Apply migration 013_admin_profiles.sql first (is_admin column missing).");
  process.exit(1);
}

if (profileError || !profile) {
  console.error("Profile not found for test user:", profileError?.message);
  process.exit(1);
}

const originalAdmin = Boolean(profile.is_admin);
console.log(`Profile email=${profile.email ?? "n/a"} is_admin=${originalAdmin}`);

async function setAdmin(flag) {
  const { error } = await admin
    .from("profiles")
    .update({ is_admin: flag })
    .eq("id", testUserId);
  if (error) throw new Error(`set is_admin=${flag} failed: ${error.message}`);
}

async function zeroBalance() {
  const { error } = await admin
    .from("credit_balances")
    .upsert({ user_id: testUserId, available: 0, reserved: 0, updated_at: new Date().toISOString() });
  if (error) throw new Error(`zero balance failed: ${error.message}`);
}

// --- Admin: 0 balance, reserve+commit succeeds, balance goes negative ---
await setAdmin(true);
await zeroBalance();

const ledgerBefore = await countLedger(admin, testUserId, "reservation");
const hold = 25;
const actual = 20;

const { data: reservationId, error: reserveError } = await admin.rpc("reserve_credits", {
  p_user_id: testUserId,
  p_amount: hold,
  p_reference: "test:admin:reserve",
  p_metadata: { test: true },
});

if (reserveError) {
  console.error("✗ Admin reserve failed:", reserveError.message);
  console.error("  (Did you apply 013_admin_profiles.sql?)");
  process.exit(1);
}

const mid = await readBalance(admin, testUserId);
if (mid.available !== -hold || mid.reserved !== hold) {
  console.error(`✗ After admin reserve: expected available=-${hold}, reserved=${hold}; got`, mid);
  process.exit(1);
}

const { error: commitError } = await admin.rpc("commit_reservation", {
  p_reservation_id: reservationId,
  p_actual_amount: actual,
});

if (commitError) {
  console.error("✗ Admin commit failed:", commitError.message);
  process.exit(1);
}

const afterAdmin = await readBalance(admin, testUserId);
const ledgerAfter = await countLedger(admin, testUserId, "reservation");

console.log(
  `✓ Admin with 0 balance: reserve+commit OK → available=${afterAdmin.available} (expect -${actual}), reserved=${afterAdmin.reserved}`,
);
if (afterAdmin.available !== -actual || afterAdmin.reserved !== 0) {
  process.exit(1);
}
if (ledgerAfter <= ledgerBefore) {
  console.error("✗ Expected new ledger reservation entry for admin job");
  process.exit(1);
}

// --- Non-admin: 0 balance, reserve blocked ---
await setAdmin(false);
await zeroBalance();

const { error: blockError } = await admin.rpc("reserve_credits", {
  p_user_id: testUserId,
  p_amount: 10,
  p_reference: "test:non-admin:block",
  p_metadata: {},
});

if (!blockError) {
  console.error("✗ Non-admin overspend should have been blocked");
  process.exit(1);
}

if (blockError.message !== "insufficient_credits") {
  console.error("✗ Expected insufficient_credits, got:", blockError.message);
  process.exit(1);
}

const afterBlock = await readBalance(admin, testUserId);
console.log(`✓ Non-admin blocked: ${blockError.message}, balance unchanged (${afterBlock.available})`);
if (afterBlock.available !== 0 || afterBlock.reserved !== 0) {
  process.exit(1);
}

await setAdmin(originalAdmin);

console.log("---");
console.log("All admin credit exemption checks passed.");
