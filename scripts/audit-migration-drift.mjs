#!/usr/bin/env node
/**
 * Compare migration expectations against live Supabase schema (service-role probes).
 *
 * Usage: node scripts/audit-migration-drift.mjs
 * Optional: SUPABASE_DB_PASSWORD for direct information_schema via psql (if installed).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

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

/** Sentinel columns introduced by each migration (probe via select). */
const MIGRATION_PROBES = [
  { file: "001_profiles.sql", probes: [{ table: "profiles", column: "id" }] },
  { file: "002_profiles_avatar.sql", probes: [{ table: "profiles", column: "avatar_url" }] },
  { file: "003_data_model.sql", probes: [{ table: "series", column: "id" }, { table: "scenes", column: "id" }] },
  { file: "004_dev_profile_seed.sql", probes: [], note: "seed data only" },
  { file: "005_storage_buckets.sql", probes: [], note: "storage buckets (not column-probed)" },
  { file: "006_generation_engine.sql", probes: [{ table: "takes", column: "id" }, { table: "assets", column: "id" }] },
  { file: "007_production_pipeline.sql", probes: [{ table: "ingredients", column: "id" }, { table: "character_sheets", column: "id" }] },
  { file: "008_delete_cascades.sql", probes: [], note: "FK/cascade changes only" },
  { file: "009_series_memory.sql", probes: [{ table: "series", column: "memory_markdown" }] },
  { file: "010_scene_shot_intent.sql", probes: [{ table: "scenes", column: "shot_intent" }] },
  { file: "011_take_has_audio.sql", probes: [{ table: "takes", column: "has_audio" }] },
  { file: "012_credits.sql", probes: [{ table: "credit_ledger", column: "id" }, { table: "credit_balances", column: "user_id" }] },
  { file: "013_admin_profiles.sql", probes: [{ table: "profiles", column: "is_admin" }] },
  { file: "014_scene_generation_defaults.sql", probes: [{ table: "scenes", column: "audio_mode" }, { table: "scenes", column: "generation_tier" }] },
  { file: "015_profile_onboarding.sql", probes: [{ table: "profiles", column: "has_completed_onboarding" }] },
  { file: "016_episode_summary.sql", probes: [{ table: "episodes", column: "summary_markdown" }] },
  { file: "017_take_provider_request.sql", probes: [{ table: "takes", column: "provider_request_id" }] },
  { file: "018_security_credit_rpc_grants.sql", probes: [], note: "GRANT/REVOKE only — verify via SQL Editor" },
  { file: "019_profile_approval.sql", probes: [{ table: "profiles", column: "approval_status" }] },
];

async function probeColumn(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return "applied";
  const msg = error.message ?? "";
  if (msg.includes("column") && msg.includes("does not exist")) return "missing_column";
  if (msg.includes("relation") && msg.includes("does not exist")) return "missing_table";
  return `unknown: ${msg}`;
}

function tryPsqlGrants(projectRef, password) {
  if (!password || !projectRef) return null;
  try {
    const host = `db.${projectRef}.supabase.co`;
    const conn = `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`;
    const sql = `
      SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = 'reserve_credits';
    `;
    const out = execSync(`psql "${conn}" -t -A -c ${JSON.stringify(sql)}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return out.trim() || "(no rows)";
  } catch (error) {
    return `psql_unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";

  console.log("=== Migration drift (live probes) ===\n");
  console.log("| Migration | Status | Notes |");
  console.log("|-----------|--------|-------|");

  for (const migration of MIGRATION_PROBES) {
    if (!migration.probes.length) {
      console.log(`| ${migration.file} | manual | ${migration.note ?? "—"} |`);
      continue;
    }
    const statuses = [];
    for (const probe of migration.probes) {
      statuses.push(await probeColumn(supabase, probe.table, probe.column));
    }
    const applied = statuses.every((s) => s === "applied");
    const status = applied ? "applied" : statuses.join(", ");
    console.log(`| ${migration.file} | ${status} | ${migration.probes.map((p) => `${p.table}.${p.column}`).join(", ")} |`);
  }

  const grants = tryPsqlGrants(projectRef, process.env.SUPABASE_DB_PASSWORD);
  if (grants) {
    console.log("\n018 reserve_credits grants (information_schema):");
    console.log(grants);
  } else {
    console.log("\n018 grants: set SUPABASE_DB_PASSWORD + psql to verify reserve_credits grantee list.");
  }

  const files = readdirSync(resolve(process.cwd(), "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const onDisk = new Set(files);
  const listed = new Set(MIGRATION_PROBES.map((m) => m.file));
  const extra = [...onDisk].filter((f) => !listed.has(f));
  if (extra.length) {
    console.log("\nUnlisted migration files on disk:", extra.join(", "));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
