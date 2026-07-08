import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

export interface ExtractedAudio {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/** Whisper hard limit is 25 MB; keep a safety margin for direct-send fallback. */
export const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

function ffmpegPath(): string | null {
  // ffmpeg-static exports the absolute binary path (or null if unavailable).
  return (ffmpegStatic as unknown as string) || process.env.FFMPEG_PATH || null;
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = ffmpegPath();
  if (!bin) return Promise.reject(new Error("ffmpeg binary not available"));

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Extract a compact mono 16 kHz MP3 from a video buffer so transcription always
 * stays well under Whisper's 25 MB cap regardless of the source video size.
 * Throws if ffmpeg is unavailable — callers handle the direct-send fallback.
 */
export async function extractAudioMp3(
  videoBuffer: Buffer,
  sourceExt: string,
): Promise<ExtractedAudio> {
  const dir = await mkdtemp(join(tmpdir(), "rw-caption-"));
  const safeExt = sourceExt.replace(/[^a-z0-9.]/gi, "") || ".mp4";
  const inputPath = join(dir, `input${safeExt.startsWith(".") ? safeExt : `.${safeExt}`}`);
  const outputPath = join(dir, "audio.mp3");

  try {
    await writeFile(inputPath, videoBuffer);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      "-f",
      "mp3",
      outputPath,
    ]);
    const buffer = await readFile(outputPath);
    return { buffer, filename: "audio.mp3", mimeType: "audio/mpeg" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const CONTAINER_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

/**
 * Best-effort audio for Whisper: extract with ffmpeg; if that fails, send the
 * original container directly when it is small enough. Throws a clear message
 * if neither path is viable.
 */
export async function prepareAudioForWhisper(
  videoBuffer: Buffer,
  sourceExt: string,
): Promise<ExtractedAudio> {
  try {
    return await extractAudioMp3(videoBuffer, sourceExt);
  } catch (error) {
    console.warn("[captioning] ffmpeg extraction failed, trying direct send", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (videoBuffer.length <= WHISPER_MAX_BYTES) {
      const ext = sourceExt.toLowerCase();
      return {
        buffer: videoBuffer,
        filename: `source${ext.startsWith(".") ? ext : ".mp4"}`,
        mimeType: CONTAINER_MIME[ext] ?? "video/mp4",
      };
    }
    throw new Error(
      "Could not extract audio and the video is too large to transcribe directly. " +
        "Re-export the episode at a smaller size and try again.",
    );
  }
}
