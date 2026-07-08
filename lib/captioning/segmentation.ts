import type { CaptionCue, WhisperSegment } from "@/lib/captioning/types";
import { MAX_CHARS_PER_LINE, MAX_LINES_PER_CUE } from "@/lib/captioning/vtt";

const MAX_CHARS_PER_CUE = MAX_CHARS_PER_LINE * MAX_LINES_PER_CUE; // ~84
const MIN_CUE_MS = 800;
const MAX_CUE_MS = 7000;

/** Split a long string into <=maxChars chunks on word boundaries. */
function splitIntoChunks(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const words = normalized.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Convert Whisper segments into caption cues:
 *  - split segments longer than ~2 lines across time proportionally,
 *  - enforce sensible min/max cue durations,
 *  - keep cues from overlapping.
 */
export function segmentsToCues(segments: WhisperSegment[]): CaptionCue[] {
  const cues: CaptionCue[] = [];

  for (const segment of segments) {
    const text = (segment.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const startMs = Math.round(segment.start * 1000);
    const endMs = Math.round(segment.end * 1000);
    const spanMs = Math.max(endMs - startMs, MIN_CUE_MS);

    const chunks = splitIntoChunks(text, MAX_CHARS_PER_CUE);
    if (chunks.length === 0) continue;

    const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
    let cursor = startMs;

    chunks.forEach((chunk, index) => {
      const share = chunk.length / totalChars;
      const isLast = index === chunks.length - 1;
      const chunkStart = cursor;
      const chunkEnd = isLast ? endMs : Math.round(chunkStart + spanMs * share);
      cursor = chunkEnd;
      cues.push({
        cueIndex: 0,
        startMs: chunkStart,
        endMs: Math.max(chunkEnd, chunkStart + 1),
        text: chunk,
      });
    });
  }

  return normalizeCues(cues);
}

/** Reindex, clamp durations, and prevent overlap between adjacent cues. */
export function normalizeCues(input: CaptionCue[]): CaptionCue[] {
  const ordered = [...input]
    .filter((cue) => cue.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const result: CaptionCue[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const cue = { ...ordered[i] };
    const next = ordered[i + 1];

    if (cue.endMs - cue.startMs < MIN_CUE_MS) {
      cue.endMs = cue.startMs + MIN_CUE_MS;
    }
    if (cue.endMs - cue.startMs > MAX_CUE_MS) {
      cue.endMs = cue.startMs + MAX_CUE_MS;
    }
    if (next && cue.endMs > next.startMs) {
      cue.endMs = Math.max(cue.startMs + 1, next.startMs - 1);
    }

    cue.cueIndex = result.length;
    cue.text = cue.text.trim();
    result.push(cue);
  }

  return result;
}
