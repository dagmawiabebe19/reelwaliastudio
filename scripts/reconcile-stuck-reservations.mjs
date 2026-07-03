#!/usr/bin/env node
/**
 * Release abandoned non-video credit reservations (service role).
 *
 * Usage: npm run reconcile:reservations
 */

import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";
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

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
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

async function isReservationOpen(reservationId) {
  const { data, error } = await admin.rpc("credit_reservation_is_open", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  return Boolean(data);
}

const { released, byKind } = await reconcileStuckReservationsCore({
  db: admin,
  releaseReservation,
  isReservationOpen,
});

console.log(
  `[reservation-sweep] released ${released} abandoned reservations ` +
    `(image:${byKind.ingredient} sheet:${byKind.sheet} copilot:${byKind.copilot} summary:${byKind.episode_summary})`,
);
