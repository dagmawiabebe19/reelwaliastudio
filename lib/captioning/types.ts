export type CaptioningStatus =
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "translating"
  | "ready"
  | "failed";

export type TranslationStatus = "pending" | "translating" | "ready" | "failed";

/** Source language is always English (from transcription). */
export const SOURCE_LANG = "en" as const;

/** A single timed caption cue (milliseconds). */
export interface CaptionCue {
  cueIndex: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** Whisper verbose_json segment (subset we use). */
export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}
