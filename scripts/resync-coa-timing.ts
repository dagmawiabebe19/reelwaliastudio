#!/usr/bin/env npx tsx
/**
 * Re-transcribe Crown of Ashes ep 1 with video-direct Wizper (correct timing),
 * sync translation cue times, re-export VTTs, and re-burn English MP4.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fal } from "@fal-ai/client";
import { segmentsToCues } from "../lib/captioning/segmentation";
import { buildSrt } from "../lib/captioning/srt";
import { buildVtt } from "../lib/captioning/vtt";
import { TARGET_LANGUAGE_CODES } from "../lib/captioning/languages";
import type { CaptionCue, WhisperSegment } from "../lib/captioning/types";

const JOB_ID = "460c3f63-99b2-48cd-8b29-5f037d16a81f";

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

type WizperChunk = { timestamp?: number[]; text?: string };

function chunksToSegments(chunks: WizperChunk[]): WhisperSegment[] {
  const segments: WhisperSegment[] = [];
  for (const chunk of chunks) {
    const text = (chunk.text ?? "").trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    const ts = chunk.timestamp ?? [];
    if (typeof ts[0] !== "number" || typeof ts[1] !== "number") continue;
    segments.push({ start: ts[0], end: Math.max(ts[0] + 0.2, ts[1]), text });
  }
  return segments;
}

async function wizperVideoDirect(videoUrl: string) {
  const input = {
    audio_url: videoUrl,
    task: "transcribe" as const,
    language: "en" as const,
    chunk_level: "segment" as const,
    max_segment_len: 10,
    merge_chunks: false,
  };
  const { request_id } = await fal.queue.submit("fal-ai/wizper", { input });
  await fal.queue.subscribeToStatus("fal-ai/wizper", { requestId: request_id, pollInterval: 2000 });
  const result = await fal.queue.result("fal-ai/wizper", { requestId: request_id });
  const data = result.data as { chunks?: WizperChunk[] };
  const chunks = data.chunks ?? [];
  console.log("\n=== WIZPER RAW CHUNKS (first 3) ===");
  chunks.slice(0, 3).forEach((c, i) =>
    console.log(`  chunk${i + 1}: [${c.timestamp?.[0]}s, ${c.timestamp?.[1]}s] "${c.text?.trim()}"`),
  );
  return { segments: chunksToSegments(chunks), requestId: request_id, chunks };
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

async function main(): Promise<void> {
  loadEnv();
  fal.config({ credentials: process.env.FAL_KEY! });
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: job } = await sb.from("captioning_jobs").select("*").eq("id", JOB_ID).single();
  if (!job) throw new Error("Job not found");

  const { data: before } = await sb
    .from("caption_cues")
    .select("start_ms,end_ms,text")
    .eq("job_id", JOB_ID)
    .eq("lang", "en")
    .order("cue_index")
    .limit(3);

  console.log("=== BEFORE (first 3 English cues) ===");
  before?.forEach((c, i) =>
    console.log(`  cue${i + 1}: [${fmt(c.start_ms / 1000)} – ${fmt(c.end_ms / 1000)}] "${c.text}"`),
  );

  const { data: signed } = await sb.storage
    .from(job.video_bucket)
    .createSignedUrl(job.video_storage_path, 3600);
  if (!signed?.signedUrl) throw new Error("Could not sign video");

  console.log("\n=== RE-TRANSCRIBE (video direct, path a) ===");
  const t0 = Date.now();
  const { segments, requestId } = await wizperVideoDirect(signed.signedUrl);
  const englishCues = segmentsToCues(segments);
  console.log(`Wizper ${requestId}: ${englishCues.length} cues in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  console.log("\n=== FINAL CUES (first 3) ===");
  englishCues.slice(0, 3).forEach((c, i) =>
    console.log(
      `  cue${i + 1}: [${fmt(c.startMs / 1000)} – ${fmt(c.endMs / 1000)}] "${c.text}"`,
    ),
  );

  if (englishCues[0]?.startMs < 5000) {
    throw new Error(
      `Cue 1 must not start during opening silence (got ${englishCues[0].startMs}ms, expected ~5880ms)`,
    );
  }

  const cue1Before = before?.[0]?.start_ms ?? 0;
  const cue1After = englishCues[0]?.startMs ?? 0;
  console.log(`\nCue 1 start: ${fmt(cue1Before / 1000)} → ${fmt(cue1After / 1000)} (delta ${((cue1After - cue1Before) / 1000).toFixed(2)}s)`);

  await sb.from("caption_cues").delete().eq("job_id", JOB_ID).eq("lang", "en");
  await sb.from("caption_cues").insert(
    englishCues.map((cue, index) => ({
      job_id: JOB_ID,
      lang: "en",
      cue_index: index,
      start_ms: cue.startMs,
      end_ms: cue.endMs,
      text: cue.text,
    })),
  );

  console.log("\n=== SYNC translation cue timings ===");
  for (const lang of TARGET_LANGUAGE_CODES) {
    const { data: rows } = await sb
      .from("caption_cues")
      .select("*")
      .eq("job_id", JOB_ID)
      .eq("lang", lang)
      .order("cue_index");
    if (!rows?.length) continue;
    for (let i = 0; i < Math.min(rows.length, englishCues.length); i++) {
      await sb
        .from("caption_cues")
        .update({
          start_ms: englishCues[i].startMs,
          end_ms: englishCues[i].endMs,
        })
        .eq("id", rows[i].id);
    }
    console.log(`  ✓ ${lang} (${Math.min(rows.length, englishCues.length)} cues synced)`);
  }

  console.log("\n=== RE-EXPORT VTT (en + 12 langs) ===");
  const allLangs = ["en", ...TARGET_LANGUAGE_CODES];
  for (const lang of allLangs) {
    const { data: rows } = await sb
      .from("caption_cues")
      .select("*")
      .eq("job_id", JOB_ID)
      .eq("lang", lang)
      .order("cue_index");
    const cues: CaptionCue[] = (rows ?? []).map((r) => ({
      cueIndex: r.cue_index,
      startMs: r.start_ms,
      endMs: r.end_ms,
      text: r.text,
    }));
    const vtt = buildVtt(cues);
    const path = `${job.owner_id}/${JOB_ID}/captions/${lang}.vtt`;
    await sb.storage.from("captioning").upload(path, vtt, {
      contentType: "text/vtt; charset=utf-8",
      upsert: true,
    });
  }
  console.log(`✓ ${allLangs.length} VTT files`);

  console.log("\n=== RE-BURN English MP4 ===");
  const tBurn = Date.now();
  const srt = buildSrt(englishCues);
  const srtFile = new File([new Blob([srt], { type: "application/x-subrip" })], "captions.srt", {
    type: "application/x-subrip",
  });
  const srtUrl = await fal.storage.upload(srtFile);
  const burn = await fal.subscribe("veed/subtitles", {
    input: {
      video_url: signed.signedUrl,
      srt_file_url: srtUrl,
      preset: "simple",
      language: "en-US",
      customization: {
        position: "bottom",
        shadow: "max",
        text_customizations: { baseline: { weight: 800, color: "#FFFFFF" } },
      },
    },
  });
  const burnedBuf = Buffer.from(await (await fetch(burn.data!.video!.url!)).arrayBuffer());
  const burnedPath = `${job.owner_id}/${JOB_ID}/burned/english.mp4`;
  await sb.storage.from("captioning").upload(burnedPath, burnedBuf, {
    contentType: "video/mp4",
    upsert: true,
  });
  await sb
    .from("captioning_jobs")
    .update({ burn_status: "ready", burned_video_path: burnedPath })
    .eq("id", JOB_ID);
  console.log(
    `✓ Burned MP4 ${(burnedBuf.length / 1_048_576).toFixed(2)} MB in ${((Date.now() - tBurn) / 1000).toFixed(1)}s`,
  );

  console.log("\nRESYNC PASSED");
}

main().catch((e) => {
  console.error("RESYNC FAILED:", e);
  process.exit(1);
});
