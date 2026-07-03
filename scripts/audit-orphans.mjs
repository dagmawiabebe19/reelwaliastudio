#!/usr/bin/env node
/**
 * Read-only orphan / integrity scan (counts only).
 *
 * Usage: node scripts/audit-orphans.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env or .env.local
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

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function parseReferenceEntity(reference) {
  if (!reference) return null;
  const take = reference.match(/^seedance:take:([0-9a-f-]{36})$/i);
  if (take) return { kind: "take", id: take[1] };
  const sheet = reference.match(/^openai-image:sheet:([0-9a-f-]{36})$/i);
  if (sheet) return { kind: "sheet", id: sheet[1] };
  const ingredient = reference.match(/^openai-image:ingredient:([0-9a-f-]{36})$/i);
  if (ingredient) return { kind: "ingredient", id: ingredient[1] };
  const copilot = reference.match(/^copilot:session:([0-9a-f-]{36})$/i);
  if (copilot) return { kind: "chat_session", id: copilot[1] };
  const summary = reference.match(/^episode-summary:([0-9a-f-]{36})$/i);
  if (summary) return { kind: "episode", id: summary[1] };
  return { kind: "other", id: null };
}

async function isReservationOpen(supabase, reservationId) {
  const { data, error } = await supabase.rpc("credit_reservation_is_open", {
    p_reservation_id: reservationId,
  });
  if (error) throw error;
  return Boolean(data);
}

async function entityExists(supabase, entity) {
  if (!entity || entity.kind === "other") return true;
  const tableByKind = {
    take: "takes",
    sheet: "character_sheets",
    ingredient: "ingredients",
    copilot_session: "chat_sessions",
    chat_session: "chat_sessions",
    episode: "episodes",
  };
  const table = tableByKind[entity.kind];
  if (!table) return true;
  const { data, error } = await supabase.from(table).select("id").eq("id", entity.id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function countStuckPendingTakes(supabase) {
  const { count, error } = await supabase
    .from("takes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("updated_at", hoursAgo(1));
  if (error) throw error;
  return count ?? 0;
}

async function countOrphanOpenReservations(supabase) {
  const { data: rows, error } = await supabase
    .from("credit_ledger")
    .select("reservation_id, reference, created_at, type, status")
    .eq("type", "reservation")
    .eq("status", "reserved")
    .lt("created_at", hoursAgo(24))
    .not("reservation_id", "is", null);
  if (error) throw error;

  let orphanCount = 0;
  const seen = new Set();
  for (const row of rows ?? []) {
    const rid = row.reservation_id;
    if (!rid || seen.has(rid)) continue;
    seen.add(rid);
    const open = await isReservationOpen(supabase, rid);
    if (!open) continue;
    const entity = parseReferenceEntity(row.reference);
    const exists = await entityExists(supabase, entity);
    if (!exists) orphanCount += 1;
  }
  return orphanCount;
}

async function storageObjectExists(supabase, bucket, path) {
  const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  const { data, error } = await supabase.storage.from(bucket).list(parent, {
    limit: 1000,
    search: name,
  });
  if (error) return false;
  return (data ?? []).some((item) => item.name === name);
}

async function countAssetsMissingStorage(supabase) {
  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, bucket, storage_path")
    .limit(2000);
  if (error) throw error;

  let missing = 0;
  for (const asset of assets ?? []) {
    const exists = await storageObjectExists(supabase, asset.bucket, asset.storage_path);
    if (!exists) missing += 1;
  }
  return missing;
}

async function listAllStoragePaths(supabase, bucket) {
  const paths = [];
  const queue = [""];
  while (queue.length) {
    const prefix = queue.pop();
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      if (!data?.length) break;
      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          paths.push(path);
        } else {
          queue.push(path);
        }
      }
      if (data.length < limit) break;
      offset += limit;
    }
  }
  return paths;
}

async function countStorageWithoutAssetRow(supabase) {
  const buckets = ["assets", "references", "audio"];
  const { data: assetRows, error } = await supabase
    .from("assets")
    .select("bucket, storage_path");
  if (error) throw error;
  const assetKeys = new Set((assetRows ?? []).map((r) => `${r.bucket}:${r.storage_path}`));

  let orphanFiles = 0;
  let scanned = 0;
  const maxScan = 5000;
  for (const bucket of buckets) {
    const paths = await listAllStoragePaths(supabase, bucket);
    for (const path of paths) {
      scanned += 1;
      if (scanned > maxScan) return orphanFiles;
      if (!assetKeys.has(`${bucket}:${path}`)) orphanFiles += 1;
    }
  }
  return orphanFiles;
}

async function countScenesMissingBindings(supabase) {
  const { data: sceneIngredients, error: siError } = await supabase
    .from("scene_ingredients")
    .select("scene_id, ingredient_id");
  if (siError) throw siError;

  const ingredientIds = [...new Set((sceneIngredients ?? []).map((r) => r.ingredient_id))];
  const { data: ingredients, error: ingError } = await supabase
    .from("ingredients")
    .select("id")
    .in("id", ingredientIds.length ? ingredientIds : ["00000000-0000-0000-0000-000000000000"]);
  if (ingError) throw ingError;
  const ingredientSet = new Set((ingredients ?? []).map((r) => r.id));
  const missingIngredients = (sceneIngredients ?? []).filter((r) => !ingredientSet.has(r.ingredient_id)).length;

  const { data: sceneSheets, error: ssError } = await supabase
    .from("scene_character_sheets")
    .select("scene_id, character_sheet_id");
  if (ssError) throw ssError;

  const sheetIds = [...new Set((sceneSheets ?? []).map((r) => r.character_sheet_id))];
  const { data: sheets, error: shError } = await supabase
    .from("character_sheets")
    .select("id")
    .in("id", sheetIds.length ? sheetIds : ["00000000-0000-0000-0000-000000000000"]);
  if (shError) throw shError;
  const sheetSet = new Set((sheets ?? []).map((r) => r.id));
  const missingSheets = (sceneSheets ?? []).filter((r) => !sheetSet.has(r.character_sheet_id)).length;

  return missingIngredients + missingSheets;
}

async function countLedgerBalanceDrift(supabase) {
  const { data: users, error: userError } = await supabase
    .from("credit_ledger")
    .select("user_id");
  if (userError) throw userError;
  const userIds = [...new Set((users ?? []).map((r) => r.user_id))];

  let driftUsers = 0;
  for (const userId of userIds) {
    const { data: entries, error } = await supabase
      .from("credit_ledger")
      .select("amount, balance_after, created_at, id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    let running = 0;
    let bad = false;
    for (const entry of entries ?? []) {
      running += entry.amount;
      if (entry.balance_after !== running) {
        bad = true;
        break;
      }
    }
    if (bad) driftUsers += 1;
  }
  return driftUsers;
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

  console.log("=== ReelWalia orphan scan (counts only) ===\n");

  const results = {};
  const checks = [
    ["stuck_pending_takes_older_than_1h", () => countStuckPendingTakes(supabase)],
    ["open_reservations_older_than_24h_no_entity", () => countOrphanOpenReservations(supabase)],
    ["assets_missing_storage_file", () => countAssetsMissingStorage(supabase)],
    ["storage_files_without_asset_row", () => countStorageWithoutAssetRow(supabase)],
    ["scene_bindings_missing_ingredient_or_sheet", () => countScenesMissingBindings(supabase)],
    ["users_with_ledger_balance_after_drift", () => countLedgerBalanceDrift(supabase)],
  ];

  for (const [label, fn] of checks) {
    try {
      results[label] = await fn();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error && "message" in error
            ? String(error.message)
            : String(error);
      results[label] = `ERROR: ${message}`;
    }
  }

  for (const [label, value] of Object.entries(results)) {
    console.log(`${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
