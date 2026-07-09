#!/usr/bin/env npx tsx
/**
 * Backfill ingredient images for a series where breakdown approval marked them
 * ready without running generation.
 *
 * Usage:
 *   npx tsx scripts/backfill-series-ingredient-images.ts <seriesId> <ownerUserId>
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const CHARACTER_HEADSHOT_PREFIX =
  "Clean neutral studio headshot. Plain seamless gray studio background, even soft lighting, neutral expression, front-facing, shoulders visible. No props, no cinematic styling, no dramatic mood, no text, no watermark. Character: ";

const LOCATION_ESTABLISHING_PREFIX =
  "Clean establishing shot of a location. Neutral daylight, clear composition, no people, no cinematic color grading, no text. Location: ";

const BUCKET = "assets";

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

function buildGeneratedAssetPath(ownerId: string, ingredientId: string, ext: string): string {
  return `${ownerId}/generated/${ingredientId}/${randomUUID()}.${ext}`;
}

async function generateImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1536x1024",
      n: 1,
    }),
  });

  const body = (await response.json()) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body.error?.message ?? `OpenAI request failed (${response.status}).`);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image data.");
  return Buffer.from(b64, "base64");
}

async function main(): Promise<void> {
  loadEnv();

  const seriesId = process.argv[2];
  const ownerId = process.argv[3];
  if (!seriesId || !ownerId) {
    console.error(
      "Usage: npx tsx scripts/backfill-series-ingredient-images.ts <seriesId> <ownerUserId>",
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ingredients, error: listError } = await db
    .from("ingredients")
    .select("id, name, kind, description, generation_status, primary_asset_id")
    .eq("series_id", seriesId)
    .in("kind", ["character", "location"])
    .is("primary_asset_id", null)
    .neq("generation_status", "pending");

  if (listError) throw new Error(listError.message);
  if (!ingredients?.length) {
    console.log("No ingredients need backfill.");
    return;
  }

  console.log(`Backfilling ${ingredients.length} ingredients for series ${seriesId}…`);

  let ok = 0;
  const errors: string[] = [];

  for (const ingredient of ingredients) {
    const description = ingredient.description?.trim();
    if (!description) {
      errors.push(`${ingredient.name}: missing description`);
      continue;
    }

    const prompt =
      ingredient.kind === "character"
        ? `${CHARACTER_HEADSHOT_PREFIX}${description}`
        : `${LOCATION_ESTABLISHING_PREFIX}${description}`;

    console.log(`Generating ${ingredient.kind} "${ingredient.name}"…`);

    await db
      .from("ingredients")
      .update({ generation_status: "pending", generation_error: null })
      .eq("id", ingredient.id);

    try {
      const buffer = await generateImage(prompt);
      const storagePath = buildGeneratedAssetPath(ownerId, ingredient.id, "png");

      const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message);

      const { data: asset, error: assetError } = await db
        .from("assets")
        .insert({
          owner_id: ownerId,
          bucket: BUCKET,
          storage_path: storagePath,
          media_type: "image",
          width: 1536,
          height: 1024,
          source: "generated",
          model: "openai-image",
          prompt,
        })
        .select("id")
        .single();

      if (assetError || !asset) throw new Error(assetError?.message ?? "Asset insert failed.");

      const { error: updateError } = await db
        .from("ingredients")
        .update({
          primary_asset_id: asset.id,
          generation_status: "ready",
          generation_error: null,
        })
        .eq("id", ingredient.id);

      if (updateError) throw new Error(updateError.message);
      ok += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      errors.push(`${ingredient.name}: ${message}`);
      await db
        .from("ingredients")
        .update({ generation_status: "failed", generation_error: message })
        .eq("id", ingredient.id);
    }
  }

  console.log(`Done: ${ok} generated, ${errors.length} errors`);
  if (errors.length) {
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
