import type { CaptionCue } from "@/lib/captioning/types";

/** WebVTT timestamp: HH:MM:SS.mmm */
export function formatVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

export const MAX_CHARS_PER_LINE = 42;
export const MAX_LINES_PER_CUE = 2;

/**
 * Wrap a cue's text to at most two lines of ~42 chars, balancing line length.
 * Greedy fill, then if it overflows two lines we keep the first two and let the
 * caller decide (segmentation already splits over-long cues by time).
 */
export function wrapCueText(
  text: string,
  maxChars = MAX_CHARS_PER_LINE,
  maxLines = MAX_LINES_PER_CUE,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines.join("\n");

  // Too many lines: rebalance into maxLines by splitting near the midpoint.
  return balanceLines(normalized, maxLines);
}

function balanceLines(text: string, maxLines: number): string {
  const words = text.split(" ");
  const perLine = Math.ceil(words.length / maxLines);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).join(" "));
  }
  return lines.slice(0, maxLines).join("\n");
}

/** Serialize cues into a valid WebVTT document. */
export function buildVtt(cues: CaptionCue[]): string {
  const ordered = [...cues].sort((a, b) => a.startMs - b.startMs || a.cueIndex - b.cueIndex);
  const blocks = ordered
    .filter((cue) => cue.text.trim().length > 0)
    .map((cue, index) => {
      const start = formatVttTimestamp(cue.startMs);
      const end = formatVttTimestamp(Math.max(cue.endMs, cue.startMs + 1));
      const body = wrapCueText(cue.text);
      return `${index + 1}\n${start} --> ${end}\n${body}`;
    });

  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}
