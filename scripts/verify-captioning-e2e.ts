#!/usr/bin/env npx tsx
/**
 * End-to-end captioning verification on Crown of Ashes ep 1.
 * Usage: npx tsx scripts/verify-captioning-e2e.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fal } from "@fal-ai/client";
import Anthropic from "@anthropic-ai/sdk";
import { segmentsToCues } from "../lib/captioning/segmentation";
import { buildSrt } from "../lib/captioning/srt";
import { buildVtt } from "../lib/captioning/vtt";
import {
  TARGET_LANGUAGE_CODES,
  getLanguage,
} from "../lib/captioning/languages";
import type { CaptionCue } from "../lib/captioning/types";
import {
  estimateBurnInCredits,
  estimateTranscriptionCredits,
  estimateTranslationCredits,
} from "../lib/credits/pricing";

const JOB_ID = "460c3f63-99b2-48cd-8b29-5f037d16a81f";
const SOURCE_LANG = "en";
const TRANSLATION_MODEL = "claude-sonnet-4-6";
const BURN_PRESET = "simple";

function loadEnv(): void {
  try {
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
  } catch {
    /* optional */
  }
}

function silentWav(seconds = 0.2, rate = 16000): Buffer {
  const n = Math.floor(seconds * rate);
  const dataLen = n * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

async function extractAudio(mediaUrl: string): Promise<string> {
  const wav = silentWav();
  const file = new File([new Uint8Array(wav)], "silence.wav", { type: "audio/wav" });
  const silenceUrl = await fal.storage.upload(file);
  const ex = await fal.subscribe("fal-ai/ffmpeg-api/merge-audios", {
    input: { audio_urls: [mediaUrl, silenceUrl], output_format: "mp3_44100_64" },
  });
  const url = ex.data?.audio?.url;
  if (!url) throw new Error("fal audio extraction returned no URL");
  return url;
}

type WizperChunk = { timestamp?: number[]; text?: string };

async function wizperTranscribe(mediaUrl: string): Promise<{
  segments: Array<{ start: number; end: number; text: string }>;
  requestId: string;
  raw: unknown;
}> {
  const input = {
    audio_url: mediaUrl,
    task: "transcribe" as const,
    language: "en" as const,
    chunk_level: "segment" as const,
    max_segment_len: 10,
    merge_chunks: false,
  };
  console.log("[wizper-submit]", JSON.stringify({ audio_url_host: new URL(mediaUrl).hostname }));
  const { request_id } = await fal.queue.submit("fal-ai/wizper", { input });
  await fal.queue.subscribeToStatus("fal-ai/wizper", { requestId: request_id, pollInterval: 2000 });
  const result = await fal.queue.result("fal-ai/wizper", { requestId: request_id });
  const data = result.data as { text?: string; chunks?: WizperChunk[]; languages?: string[] };
  console.log("[wizper-response]", JSON.stringify({ requestId: request_id, raw: data }));
  const segments: Array<{ start: number; end: number; text: string }> = [];
  let lastEnd = 0;
  for (const chunk of data.chunks ?? []) {
    const text = (chunk.text ?? "").trim();
    if (!text) continue;
    const ts = chunk.timestamp ?? [];
    const start = typeof ts[0] === "number" ? ts[0] : lastEnd;
    const end = typeof ts[1] === "number" ? Math.max(start + 0.2, ts[1]) : start + 2;
    lastEnd = end;
    segments.push({ start, end, text });
  }
  if (segments.length === 0) {
    throw new Error(`Wizper returned zero chunks (request ${request_id})`);
  }
  return { segments, requestId: request_id, raw: data };
}

async function translateCues(
  client: Anthropic,
  langCode: string,
  cues: CaptionCue[],
): Promise<CaptionCue[]> {
  const lang = getLanguage(langCode);
  const label = lang?.label ?? langCode;
  const native = lang?.nativeName ?? langCode;
  const payload = cues.map((c, i) => ({ i, t: c.text }));
  const response = await client.messages.create({
    model: TRANSLATION_MODEL,
    max_tokens: 8192,
    system: `Translate English subtitle cues to ${label} (${native}). Return ONLY JSON array [{i,t}] same count/order. Use native script.`,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const jsonText = text.trim().startsWith("[")
    ? text.trim()
    : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  const parsed = JSON.parse(jsonText) as Array<{ i: number; t: string }>;
  const byIndex = new Map(parsed.map((p) => [p.i, p.t]));
  return cues.map((cue, index) => ({
    ...cue,
    cueIndex: index,
    text: (byIndex.get(index) ?? byIndex.get(cue.cueIndex) ?? cue.text).trim(),
  }));
}

async function main(): Promise<void> {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const falKey = process.env.FAL_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!url || !key || !falKey || !anthropicKey) {
    throw new Error("Missing env: SUPABASE, FAL_KEY, or ANTHROPIC_API_KEY");
  }

  fal.config({ credentials: falKey });
  const sb = createClient(url, key);
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const timings: Record<string, number> = {};
  const t0 = Date.now();

  const { data: job, error: jobErr } = await sb
    .from("captioning_jobs")
    .select("*")
    .eq("id", JOB_ID)
    .single();
  if (jobErr || !job) throw new Error(`Job not found: ${jobErr?.message}`);

  console.log("\n=== RESET JOB ===");
  await sb.from("caption_cues").delete().eq("job_id", JOB_ID);
  await sb.from("caption_translations").delete().eq("job_id", JOB_ID);
  await sb
    .from("captioning_jobs")
    .update({
      status: "transcribing",
      fail_reason: null,
      english_approved_at: null,
      burn_status: "none",
      burned_video_path: null,
      burn_fail_reason: null,
    })
    .eq("id", JOB_ID);

  console.log("\n=== (a) TRANSCRIPTION ===");
  const tTrans = Date.now();
  const { data: signed } = await sb.storage
    .from(job.video_bucket)
    .createSignedUrl(job.video_storage_path, 3600);
  if (!signed?.signedUrl) throw new Error("Could not sign video URL");

  const audioUrl = await extractAudio(signed.signedUrl);
  console.log("extracted audio:", audioUrl);
  const { segments, requestId } = await wizperTranscribe(audioUrl);
  const englishCues = segmentsToCues(segments);
  if (englishCues.length === 0) throw new Error("Zero cues after segmentation");

  await sb.from("caption_cues").delete().eq("job_id", JOB_ID).eq("lang", SOURCE_LANG);
  await sb.from("caption_cues").insert(
    englishCues.map((cue, index) => ({
      job_id: JOB_ID,
      lang: SOURCE_LANG,
      cue_index: index,
      start_ms: cue.startMs,
      end_ms: cue.endMs,
      text: cue.text,
    })),
  );
  await sb
    .from("captioning_jobs")
    .update({ status: "transcribed", duration_seconds: segments[segments.length - 1].end })
    .eq("id", JOB_ID);

  timings.transcriptionSec = (Date.now() - tTrans) / 1000;
  console.log(`✓ ${englishCues.length} English cues (wizper ${requestId})`);
  englishCues.slice(0, 4).forEach((c) => {
    console.log(`  [${(c.startMs / 1000).toFixed(2)}s] ${c.text}`);
  });

  console.log("\n=== (b) APPROVE ENGLISH + TRANSLATIONS ===");
  const tTr = Date.now();
  await sb
    .from("captioning_jobs")
    .update({ english_approved_at: new Date().toISOString(), status: "translating" })
    .eq("id", JOB_ID);

  for (const lang of TARGET_LANGUAGE_CODES) {
    await sb.from("caption_translations").upsert(
      { job_id: JOB_ID, lang, status: "translating" },
      { onConflict: "job_id,lang" },
    );
    const translated = await translateCues(anthropic, lang, englishCues);
    await sb.from("caption_cues").delete().eq("job_id", JOB_ID).eq("lang", lang);
    await sb.from("caption_cues").insert(
      translated.map((cue, index) => ({
        job_id: JOB_ID,
        lang,
        cue_index: index,
        start_ms: cue.startMs,
        end_ms: cue.endMs,
        text: cue.text,
      })),
    );
    await sb
      .from("caption_translations")
      .update({ status: "ready", fail_reason: null })
      .eq("job_id", JOB_ID)
      .eq("lang", lang);
    console.log(`  ✓ ${lang} (${translated.length} cues)`);
  }
  await sb.from("captioning_jobs").update({ status: "ready" }).eq("id", JOB_ID);
  timings.translationSec = (Date.now() - tTr) / 1000;

  const { data: amCues } = await sb
    .from("caption_cues")
    .select("text")
    .eq("job_id", JOB_ID)
    .eq("lang", "am")
    .order("cue_index")
    .limit(2);
  const { data: jaCues } = await sb
    .from("caption_cues")
    .select("text")
    .eq("job_id", JOB_ID)
    .eq("lang", "ja")
    .order("cue_index")
    .limit(2);
  console.log("  Amharic spot-check:", amCues?.map((c) => c.text).join(" | "));
  console.log("  Japanese spot-check:", jaCues?.map((c) => c.text).join(" | "));

  console.log("\n=== (c) VTT EXPORT ===");
  const vttLangs = [SOURCE_LANG, ...TARGET_LANGUAGE_CODES];
  let vttOk = 0;
  for (const lang of vttLangs) {
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
    if (!vtt.startsWith("WEBVTT") || cues.length === 0) {
      throw new Error(`Invalid VTT for ${lang}`);
    }
    const path = `${job.owner_id}/${JOB_ID}/captions/${lang}.vtt`;
    await sb.storage.from("captioning").upload(path, vtt, {
      contentType: "text/vtt; charset=utf-8",
      upsert: true,
    });
    vttOk++;
  }
  console.log(`✓ ${vttOk} VTT files uploaded (en + ${TARGET_LANGUAGE_CODES.length} languages)`);

  console.log("\n=== (d) BURN-IN (veed/subtitles) ===");
  const tBurn = Date.now();
  const srt = buildSrt(englishCues);
  const srtBlob = new Blob([srt], { type: "application/x-subrip" });
  const srtFile = new File([srtBlob], "captions.srt", { type: "application/x-subrip" });
  const srtFileUrl = await fal.storage.upload(srtFile);
  const burnInput = {
    video_url: signed.signedUrl,
    srt_file_url: srtFileUrl,
    preset: BURN_PRESET,
    language: "en-US",
    customization: {
      position: "bottom" as const,
      shadow: "max" as const,
      text_customizations: {
        baseline: { weight: 800, color: "#FFFFFF" },
      },
    },
  };
  console.log("[burn-submit] veed/subtitles", { srt_bytes: srt.length, srt_file_url: srtFileUrl });
  const burn = await fal.subscribe("veed/subtitles", { input: burnInput });
  const burnedUrl = burn.data?.video?.url;
  if (!burnedUrl) throw new Error("veed/subtitles returned no video URL");
  const burnedResp = await fetch(burnedUrl);
  const burnedBuf = Buffer.from(await burnedResp.arrayBuffer());
  if (burnedBuf.length < 100_000) throw new Error(`Burned MP4 too small: ${burnedBuf.length} bytes`);
  const burnedPath = `${job.owner_id}/${JOB_ID}/burned/english.mp4`;
  await sb.storage.from("captioning").upload(burnedPath, burnedBuf, {
    contentType: "video/mp4",
    upsert: true,
  });
  await sb
    .from("captioning_jobs")
    .update({ burn_status: "ready", burned_video_path: burnedPath, burn_fail_reason: null })
    .eq("id", JOB_ID);
  timings.burnSec = (Date.now() - tBurn) / 1000;
  console.log(`✓ Burned MP4 stored (${(burnedBuf.length / 1_048_576).toFixed(2)} MB) request ${burn.requestId}`);

  const duration = job.duration_seconds ?? 68;
  const transCredits = estimateTranscriptionCredits(duration);
  const trCredits = estimateTranslationCredits(englishCues.length, TARGET_LANGUAGE_CODES.length);
  const burnCredits = estimateBurnInCredits(duration, BURN_PRESET);

  timings.totalSec = (Date.now() - t0) / 1000;
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({ timings, credits: { transcription: transCredits, translation: trCredits, burn: burnCredits } }, null, 2));
  console.log("\nE2E PASSED");
}

main().catch((e) => {
  console.error("\nE2E FAILED:", e);
  process.exit(1);
});
