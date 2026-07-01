#!/usr/bin/env node
/**
 * Repair rescued take assets that were stored under the wrong path prefix.
 * Wrong:  generated/{ownerId}/{sceneId}/{file}.mp4  (RLS first segment != owner)
 * Correct: {ownerId}/generated/{sceneId}/{file}.mp4
 *
 * Usage: node scripts/repair-rescued-asset-paths.mjs
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

function correctPath(storagePath) {
  const parts = storagePath.split("/");
  if (parts[0] !== "generated" || parts.length < 4) return null;
  const ownerId = parts[1];
  const sceneId = parts[2];
  const filename = parts.slice(3).join("/");
  return `${ownerId}/generated/${sceneId}/${filename}`;
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: assets, error } = await sb
  .from("assets")
  .select("id, bucket, storage_path, owner_id")
  .like("storage_path", "generated/%");

if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

console.log(`Found ${assets?.length ?? 0} asset(s) with legacy generated/ prefix\n`);

const reports = [];
for (const asset of assets ?? []) {
  const newPath = correctPath(asset.storage_path);
  if (!newPath) {
    reports.push({ id: asset.id, result: "skipped", reason: "unrecognized path" });
    continue;
  }
  if (newPath === asset.storage_path) {
    reports.push({ id: asset.id, result: "skipped", reason: "already correct" });
    continue;
  }

  const { error: moveError } = await sb.storage.from(asset.bucket).move(asset.storage_path, newPath);
  if (moveError) {
    reports.push({
      id: asset.id,
      result: "error",
      from: asset.storage_path,
      to: newPath,
      error: moveError.message,
    });
    continue;
  }

  const { error: updateError } = await sb
    .from("assets")
    .update({ storage_path: newPath })
    .eq("id", asset.id);
  if (updateError) {
    reports.push({
      id: asset.id,
      result: "error",
      error: `moved but db update failed: ${updateError.message}`,
      to: newPath,
    });
    continue;
  }

  reports.push({
    id: asset.id,
    result: "repaired",
    from: asset.storage_path,
    to: newPath,
  });
}

console.log(JSON.stringify(reports, null, 2));
const repaired = reports.filter((r) => r.result === "repaired").length;
console.log(`\nRepaired ${repaired} asset path(s).`);
