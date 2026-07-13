#!/usr/bin/env npx tsx
/**
 * Delete confirmed empty Heat Beat duplicate scenes from Crown of Ashes EP2.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): void {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadEnv();
  process.env.DEV_NO_AUTH = "true";

  // Keep the real scene with Mara + Adrian sheets bound.
  const KEEP = "7a6fa85f-be6c-48f7-b059-3459811b8eab";
  const DELETE = [
    "de2a8c6e-9169-49bb-9ab6-0bf321ad33f1",
    "4df91f8d-a505-4821-b3bd-850204bf832d",
  ];

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: keep, error: keepErr } = await db
    .from("scenes")
    .select("id,title")
    .eq("id", KEEP)
    .maybeSingle();
  if (keepErr || !keep) {
    throw new Error(`Keep-scene missing — aborting. ${keepErr?.message ?? "not found"}`);
  }
  const { count: sheetCount } = await db
    .from("scene_character_sheets")
    .select("*", { count: "exact", head: true })
    .eq("scene_id", KEEP);
  if ((sheetCount ?? 0) < 2) {
    throw new Error(`Keep-scene has only ${sheetCount} sheets — aborting.`);
  }
  console.log(`Keeping ${keep.id} (${keep.title}) with ${sheetCount} sheets`);

  // Mirror deleteSceneWithCleanup with service-role (no request cookies).
  for (const sceneId of DELETE) {
    const { data: scene } = await db.from("scenes").select("id,title").eq("id", sceneId).maybeSingle();
    if (!scene) {
      console.log(`Already gone: ${sceneId}`);
      continue;
    }
    const { data: takes } = await db.from("takes").select("id,primary_asset_id").eq("scene_id", sceneId);
    if (takes?.length) {
      throw new Error(`Refusing to delete ${sceneId} — has ${takes.length} takes`);
    }
    const { error } = await db.from("scenes").delete().eq("id", sceneId);
    if (error) throw new Error(error.message);
    console.log(`Deleted empty duplicate: ${scene.id} (${scene.title})`);
  }

  const { data: remaining } = await db
    .from("scenes")
    .select("id,title")
    .in("id", [...DELETE, KEEP]);
  console.log("Remaining among targets:", remaining);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
