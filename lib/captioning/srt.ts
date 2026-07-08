import type { CaptionCue } from "@/lib/captioning/types";
import { wrapCueText } from "@/lib/captioning/vtt";

/** SubRip timestamp: HH:MM:SS,mmm (comma, not dot). */
export function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Serialize caption cues into SubRip (.srt).
 * fal's veed/subtitles takes SRT via `srt_content` (skips transcription and
 * burns exactly these cues), so we convert our reviewed cues to SRT.
 */
export function buildSrt(cues: CaptionCue[]): string {
  const ordered = [...cues]
    .filter((cue) => cue.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.cueIndex - b.cueIndex);

  const blocks = ordered.map((cue, index) => {
    const start = formatSrtTimestamp(cue.startMs);
    const end = formatSrtTimestamp(Math.max(cue.endMs, cue.startMs + 1));
    const body = wrapCueText(cue.text);
    return `${index + 1}\n${start} --> ${end}\n${body}`;
  });

  return `${blocks.join("\n\n")}\n`;
}
