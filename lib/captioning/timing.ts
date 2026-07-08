/**
 * Global caption timing offset (milliseconds). Positive shifts all cues later;
 * negative shifts earlier. Useful for nudging systematic drift without re-encoding.
 *
 * Env: CAPTION_TIMING_OFFSET_MS (default 0)
 */
export function getCaptionTimingOffsetMs(): number {
  const raw = process.env.CAPTION_TIMING_OFFSET_MS?.trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

/** Apply the global offset and clamp to non-negative timeline positions. */
export function applyTimingOffset(ms: number): number {
  return Math.max(0, ms + getCaptionTimingOffsetMs());
}
