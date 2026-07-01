#!/usr/bin/env node
/**
 * Rescue stuck pending video takes by reconciling fal queue status.
 *
 * Usage:
 *   npm run reconcile:takes
 *   npm run reconcile:takes -- --series AFTERGLOW --wait
 *   RECONCILE_REQUEST_MAP='takeId:requestId,takeId:requestId' npm run reconcile:takes
 */

import { createClient } from "@supabase/supabase-js";
import { fal, ApiError } from "@fal-ai/client";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

const FAST_ENDPOINT = "bytedance/seedance-2.0/fast/reference-to-video";
const STANDARD_ENDPOINT = "bytedance/seedance-2.0/reference-to-video";
const SEEDANCE_USD_PER_SECOND = {
  "fast:720p": 0.08,
  "fast:480p": 0.05,
  "standard:720p": 0.12,
  "standard:480p": 0.08,
};

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

function parseArgs(argv) {
  const args = { series: "AFTERGLOW", wait: true, minAge: 0 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--series") args.series = argv[++i];
    else if (argv[i] === "--wait") args.wait = true;
    else if (argv[i] === "--no-wait") args.wait = false;
    else if (argv[i] === "--min-age") args.minAge = Number(argv[++i] ?? 0);
  }
  return args;
}

function parseManualMap() {
  const raw = process.env.RECONCILE_REQUEST_MAP ?? "";
  const map = {};
  for (const part of raw.split(/[,\s]+/)) {
    const [takeId, requestId] = part.split(":");
    if (takeId && requestId) map[takeId.trim()] = requestId.trim();
  }
  return map;
}

function extractRequestId(text) {
  if (!text) return null;
  const match =
    text.match(/\[request\s+([0-9a-f-]{36})\]/i) ??
    text.match(/request[_\s-]?id[:\s]+([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function probeMp4DurationSeconds(buffer) {
  const marker = Buffer.from("mvhd");
  const idx = buffer.indexOf(marker);
  if (idx < 4) return null;
  const start = idx - 4;
  if (start + 40 > buffer.length) return null;
  const version = buffer.readUInt8(start + 8);
  if (version === 0) {
    const timescale = buffer.readUInt32BE(start + 20);
    const duration = buffer.readUInt32BE(start + 24);
    if (timescale > 0) return duration / timescale;
  }
  return null;
}

function estimateVideoCredits(tier, resolution, durationSeconds) {
  const key = `${tier === "standard" ? "standard" : "fast"}:${resolution === "480p" ? "480p" : "720p"}`;
  const usd = (SEEDANCE_USD_PER_SECOND[key] ?? 0.08) * Math.max(1, Math.ceil(durationSeconds));
  return Math.max(1, Math.ceil(usd * 100));
}

async function falStatus(endpoint, requestId) {
  try {
    return await fal.queue.status(endpoint, { requestId });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return { status: "NOT_FOUND" };
    throw error;
  }
}

async function resolveJob(take, requestId, preferredEndpoint) {
  const endpoints = [preferredEndpoint, FAST_ENDPOINT, STANDARD_ENDPOINT].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  for (const endpoint of endpoints) {
    const status = await falStatus(endpoint, requestId);
    if (status.status !== "NOT_FOUND") return { endpoint, status };
  }
  return null;
}

async function listFalRequests(endpoint, start, end) {
  const key = process.env.FAL_KEY;
  const params = new URLSearchParams({ endpoint_id: endpoint, limit: "100" });
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const res = await fetch(`https://api.fal.ai/v1/models/requests/by-endpoint?${params}`, {
    headers: { Authorization: `Key ${key}` },
  });
  if (!res.ok) return [];
  const payload = await res.json();
  return payload.items ?? [];
}

function falRequestTimestamp(row) {
  const raw = row.sent_at ?? row.started_at ?? row.created_at ?? row.ended_at;
  return raw ? new Date(raw).getTime() : 0;
}

function matchFalRequestsToTakes(takes, requests, maxDeltaMs = 5 * 60_000) {
  const sortedRequests = [...requests].sort((a, b) => falRequestTimestamp(a) - falRequestTimestamp(b));
  const sortedTakes = [...takes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const used = new Set();
  const matches = new Map();

  for (const take of sortedTakes) {
    const takeTime = new Date(take.created_at).getTime();
    let best = null;
    let bestDelta = Infinity;
    for (const row of sortedRequests) {
      if (!row.request_id || used.has(row.request_id)) continue;
      const delta = Math.abs(falRequestTimestamp(row) - takeTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = row;
      }
    }
    if (best?.request_id && bestDelta <= maxDeltaMs) {
      used.add(best.request_id);
      matches.set(take.id, { requestId: best.request_id, endpoint: best.endpoint_id });
    }
  }
  return matches;
}

async function discoverRequestId(take, manualMap, timestampMatches) {
  if (manualMap[take.id]) return { requestId: manualMap[take.id], endpoint: STANDARD_ENDPOINT };
  if (timestampMatches?.has(take.id)) return timestampMatches.get(take.id);
  if (take.provider_request_id) {
    return { requestId: take.provider_request_id, endpoint: take.provider_endpoint ?? STANDARD_ENDPOINT };
  }
  const parsed = extractRequestId(take.error_message);
  if (parsed) return { requestId: parsed, endpoint: STANDARD_ENDPOINT };
  return null;
}

async function findOpenReservation(sb, takeId) {
  const reference = `seedance:take:${takeId}`;
  const { data } = await sb
    .from("credit_ledger")
    .select("reservation_id, user_id, amount, status, type")
    .eq("reference", reference)
    .eq("type", "reservation")
    .eq("status", "reserved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.reservation_id) return null;
  const { data: open } = await sb.rpc("credit_reservation_is_open", {
    p_reservation_id: data.reservation_id,
  });
  return open ? data : null;
}

async function commitReservation(sb, reservationId, actualCredits) {
  const { error } = await sb.rpc("commit_reservation", {
    p_reservation_id: reservationId,
    p_actual_amount: actualCredits,
  });
  if (error) throw new Error(`commit_reservation failed: ${error.message}`);
}

async function releaseReservation(sb, reservationId) {
  const { error } = await sb.rpc("release_reservation", { p_reservation_id: reservationId });
  if (error) throw new Error(`release_reservation failed: ${error.message}`);
}

async function rescueCompletedTake(sb, take, endpoint, requestId, reservation) {
  const result = await fal.queue.result(endpoint, { requestId });
  const videoUrl = result.data?.video?.url;
  if (!videoUrl) throw new Error("fal completed but no video URL");

  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error(`download failed ${videoResponse.status}`);
  const buffer = Buffer.from(await videoResponse.arrayBuffer());
  const durationSeconds =
    probeMp4DurationSeconds(buffer) ?? Number(take.duration_seconds ?? 6);
  const ownerId = reservation?.user_id;
  if (!ownerId) throw new Error("No owner user_id on open reservation");

  const storagePath = `${ownerId}/generated/${take.scene_id}/${randomUUID()}.mp4`;
  const { error: uploadError } = await sb.storage.from("assets").upload(storagePath, buffer, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (uploadError) throw new Error(`storage upload failed: ${uploadError.message}`);

  const { data: asset, error: assetError } = await sb
    .from("assets")
    .insert({
      owner_id: ownerId,
      bucket: "assets",
      storage_path: storagePath,
      media_type: "video",
      duration_ms: Math.round(durationSeconds * 1000),
      source: "generated",
      model: take.model ?? "seedance",
    })
    .select("id")
    .single();
  if (assetError) throw new Error(`asset insert failed: ${assetError.message}`);

  const updatePayload = {
    status: "ready",
    asset_id: asset.id,
    error_message: null,
    duration_seconds: durationSeconds,
    has_audio: true,
    provider_request_id: requestId,
    provider_endpoint: endpoint,
    provider_submitted_at: take.provider_submitted_at ?? take.created_at,
  };

  const basePayload = {
    status: "ready",
    asset_id: asset.id,
    error_message: null,
    duration_seconds: durationSeconds,
    has_audio: true,
  };

  let { error: takeError } = await sb.from("takes").update(updatePayload).eq("id", take.id);
  if (takeError?.message?.includes("provider_")) {
    ({ error: takeError } = await sb.from("takes").update(basePayload).eq("id", take.id));
  }
  if (takeError) throw new Error(`take update failed: ${takeError.message}`);

  let creditsCommitted = 0;
  if (reservation?.reservation_id) {
    const tier = take.resolution === "480p" ? "fast" : "standard";
    creditsCommitted = estimateVideoCredits(tier, take.resolution ?? "720p", durationSeconds);
    await commitReservation(sb, reservation.reservation_id, creditsCommitted);
  }

  return { creditsCommitted, videoUrl, durationSeconds };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);
  const manualMap = parseManualMap();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const falKey = process.env.FAL_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  if (!falKey) throw new Error("Missing FAL_KEY");
  fal.config({ credentials: falKey });

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: seriesRows } = await sb.from("series").select("id,title").ilike("title", `%${args.series}%`);
  const series = seriesRows?.[0];
  if (!series) throw new Error(`Series not found: ${args.series}`);

  const { data: episodes } = await sb.from("episodes").select("id").eq("series_id", series.id);
  const episodeIds = (episodes ?? []).map((e) => e.id);
  const { data: scenes } = await sb.from("scenes").select("id").in("episode_id", episodeIds);
  const sceneIds = (scenes ?? []).map((s) => s.id);

  const { data: takes, error } = await sb
    .from("takes")
    .select("*")
    .in("scene_id", sceneIds)
    .eq("status", "pending")
    .eq("media_type", "video")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const filtered = (takes ?? []).filter((take) => {
    if (!args.minAge) return true;
    const ageMs = Date.now() - new Date(take.created_at).getTime();
    return ageMs >= args.minAge * 60_000;
  });

  console.log(`\nReconciling ${filtered.length} stuck take(s) for ${series.title}\n`);

  const times = filtered.map((take) => new Date(take.created_at).getTime());
  const windowStart = new Date(Math.min(...times) - 10 * 60_000).toISOString();
  const windowEnd = new Date(Math.max(...times) + 45 * 60_000).toISOString();
  const falRequests = [];
  for (const endpoint of [FAST_ENDPOINT, STANDARD_ENDPOINT]) {
    falRequests.push(...(await listFalRequests(endpoint, windowStart, windowEnd)));
  }
  const timestampMatches = matchFalRequestsToTakes(filtered, falRequests);

  const reports = [];
  for (const take of filtered) {
    const reservation = await findOpenReservation(sb, take.id);
    const discovered = await discoverRequestId(take, manualMap, timestampMatches);

    if (!discovered) {
      reports.push({
        takeId: take.id,
        takeNumber: take.take_number,
        sceneId: take.scene_id,
        result: "unmatched",
        reason: "no_request_id — set RECONCILE_REQUEST_MAP from fal dashboard",
        reservationOpen: Boolean(reservation),
      });
      continue;
    }

    let resolved = await resolveJob(take, discovered.requestId, discovered.endpoint);
    if (!resolved) {
      reports.push({
        takeId: take.id,
        takeNumber: take.take_number,
        result: "unmatched",
        requestId: discovered.requestId,
        reason: "request_id_not_found_on_fal",
        reservationOpen: Boolean(reservation),
      });
      continue;
    }

    if (
      args.wait &&
      resolved.status.status !== "COMPLETED" &&
      resolved.status.status !== "FAILED"
    ) {
      await fal.queue.subscribeToStatus(resolved.endpoint, {
        requestId: discovered.requestId,
        pollInterval: 2000,
      });
      resolved = await resolveJob(take, discovered.requestId, resolved.endpoint);
      if (!resolved) continue;
    }

    if (resolved.status.status === "COMPLETED") {
      try {
        const rescued = await rescueCompletedTake(
          sb,
          take,
          resolved.endpoint,
          discovered.requestId,
          reservation,
        );
        reports.push({
          takeId: take.id,
          takeNumber: take.take_number,
          result: "rescued",
          requestId: discovered.requestId,
          endpoint: resolved.endpoint,
          creditsCommitted: rescued.creditsCommitted,
          durationSeconds: rescued.durationSeconds,
        });
      } catch (err) {
        reports.push({
          takeId: take.id,
          takeNumber: take.take_number,
          result: "error",
          requestId: discovered.requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (resolved.status.status === "FAILED") {
      await sb
        .from("takes")
        .update({
          status: "failed",
          error_message: resolved.status.error ?? "fal reported job failed",
        })
        .eq("id", take.id);
      let refunded = false;
      if (reservation?.reservation_id) {
        await releaseReservation(sb, reservation.reservation_id);
        refunded = true;
      }
      reports.push({
        takeId: take.id,
        takeNumber: take.take_number,
        result: "failed_per_fal",
        requestId: discovered.requestId,
        error: resolved.status.error ?? "fal failed",
        refunded,
      });
      continue;
    }

    reports.push({
      takeId: take.id,
      takeNumber: take.take_number,
      result: "reattached",
      requestId: discovered.requestId,
      endpoint: resolved.endpoint,
      falStatus: resolved.status.status,
      reservationOpen: Boolean(reservation),
      note: "Job still alive on fal — open episode studio or rerun with --wait",
    });
  }

  console.log(JSON.stringify(reports, null, 2));

  const ownerId = (await findOpenReservation(sb, filtered[0]?.id))?.user_id;
  if (ownerId) {
    const { data: balance } = await sb
      .from("credit_balances")
      .select("available, reserved")
      .eq("user_id", ownerId)
      .maybeSingle();
    console.log("\nLedger:", balance);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
