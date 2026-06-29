export const DEFAULT_SEEDANCE_MODEL = "bytedance/seedance-2.0/reference-to-video";
export const DEFAULT_SEEDANCE_FAST_MODEL = "bytedance/seedance-2.0/fast/reference-to-video";

export const SEEDANCE_TIER_OPTIONS = [
  { id: "standard", label: "Standard" },
  { id: "fast", label: "Fast (cheaper)" },
] as const;

export type SeedanceTierId = (typeof SEEDANCE_TIER_OPTIONS)[number]["id"];

/** fal accepts 4–15 seconds (string enum). */
export const SEEDANCE_DURATION_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export type SeedanceDurationSeconds = (typeof SEEDANCE_DURATION_OPTIONS)[number];

export const SEEDANCE_AUDIO_MODE_OPTIONS = [
  { id: "off", label: "Audio: Off" },
  { id: "full", label: "Audio: Full" },
  { id: "ambient", label: "Audio: Ambient/SFX only" },
] as const;

export type SeedanceAudioMode = (typeof SEEDANCE_AUDIO_MODE_OPTIONS)[number]["id"];

/** fal Seedance only exposes generate_audio (boolean) — ambient uses the same flag as full. */
export function seedanceGenerateAudio(mode: SeedanceAudioMode): boolean {
  return mode === "full" || mode === "ambient";
}
