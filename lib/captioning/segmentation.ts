import type { CaptionCue, WhisperSegment } from "@/lib/captioning/types";
import { applyTimingOffset } from "@/lib/captioning/timing";
import { MAX_CHARS_PER_LINE, MAX_LINES_PER_CUE } from "@/lib/captioning/vtt";

const MAX_CHARS_PER_CUE = MAX_CHARS_PER_LINE * MAX_LINES_PER_CUE; // ~84
/** Safety cap only — do not extend cues to this minimum (speech timing is exact). */
const MAX_CUE_MS = 7000;
/** Gap left between adjacent cues so a caption does not linger into silence. */
const CUE_GAP_MS = 80;

/** Split on sentence boundaries so each cue tracks one spoken line. */
function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);
  if (!parts || parts.length <= 1) return [normalized];
  return parts.map((p) => p.trim()).filter(Boolean);
}

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

/** Expand a segment into sentence-level sub-segments with proportional timing. */
function segmentToSentenceSegments(segment: WhisperSegment): WhisperSegment[] {
  const sentences = splitSentences(segment.text ?? "");
  if (sentences.length <= 1) return [segment];

  const startMs = segment.start * 1000;
  const endMs = segment.end * 1000;
  const spanMs = Math.max(endMs - startMs, 1);
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;

  let cursor = startMs;
  return sentences.map((sentence, index) => {
    const isLast = index === sentences.length - 1;
    const share = sentence.length / totalChars;
    const chunkStart = cursor;
    const chunkEnd = isLast ? endMs : chunkStart + spanMs * share;
    cursor = chunkEnd;
    return {
      start: chunkStart / 1000,
      end: chunkEnd / 1000,
      text: sentence,
    };
  });
}

/**
 * Convert Whisper segments into caption cues aligned to spoken voice:
 *  - one sentence per cue where possible,
 *  - exact Wizper start/end (no min-duration stretch into silence),
 *  - trim overlap so cues do not linger into pauses.
 */
export function segmentsToCues(segments: WhisperSegment[]): CaptionCue[] {
  const cues: CaptionCue[] = [];

  for (const rawSegment of segments) {
    const text = (rawSegment.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    for (const segment of segmentToSentenceSegments(rawSegment)) {
      const startMs = applyTimingOffset(Math.round(segment.start * 1000));
      const endMs = applyTimingOffset(Math.round(segment.end * 1000));
      const spanMs = Math.max(endMs - startMs, 1);

      const chunks = splitIntoChunks(segment.text, MAX_CHARS_PER_CUE);
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
  }

  return normalizeCues(cues);
}

/** Reindex, cap max duration, and trim overlap on END only — never move starts. */
export function normalizeCues(input: CaptionCue[]): CaptionCue[] {
  const ordered = [...input]
    .filter((cue) => cue.text.trim().length > 0)
    .filter((cue) => /[\p{L}\p{N}]/u.test(cue.text))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const result: CaptionCue[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const cue = { ...ordered[i] };
    const next = ordered[i + 1];

    // Only trim end — never pull start earlier to fill preceding silence.
    if (cue.endMs - cue.startMs > MAX_CUE_MS) {
      cue.endMs = cue.startMs + MAX_CUE_MS;
    }
    if (next && cue.endMs > next.startMs - CUE_GAP_MS) {
      cue.endMs = Math.max(cue.startMs + 1, next.startMs - CUE_GAP_MS);
    }

    cue.cueIndex = result.length;
    cue.text = cue.text.trim();
    result.push(cue);
  }

  return result;
}
