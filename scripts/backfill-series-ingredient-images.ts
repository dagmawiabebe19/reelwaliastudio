#!/usr/bin/env npx tsx
/**
 * Backfill ingredient images for a series where breakdown approval marked them
 * ready without running generation (e.g. Sophia series).
 *
 * Usage:
 *   DEV_NO_AUTH=true npx tsx scripts/backfill-series-ingredient-images.ts <seriesId> <ownerUserId>
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

  const seriesId = process.argv[2];
  const userId = process.argv[3];
  if (!seriesId || !userId) {
    console.error(
      "Usage: DEV_NO_AUTH=true npx tsx scripts/backfill-series-ingredient-images.ts <seriesId> <ownerUserId>",
    );
    process.exit(1);
  }

  const { backfillIngredientImages } = await import(
    "../lib/screenplay/backfill-ingredient-images"
  );

  console.log(`Backfilling ingredient images for series ${seriesId} (owner ${userId})…`);
  const result = await backfillIngredientImages({ seriesId, userId });
  console.log(`Done: ${result.queued} generated, ${result.errors.length} errors`);
  if (result.errors.length) {
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
