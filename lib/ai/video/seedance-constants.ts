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

export const SEEDANCE_AUDIO_MODE_SUMMARY: Record<SeedanceAudioMode, string> = {
  off: "silent",
  full: "full dialogue",
  ambient: "ambient",
};

export function normalizeSeedanceAudioMode(
  value: string | null | undefined,
): SeedanceAudioMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "off" || normalized === "full" || normalized === "ambient") {
    return normalized;
  }
  return null;
}

export type GenerationQualityMode = "draft" | "final";

export function resolveQualitySettings(quality: GenerationQualityMode): {
  tier: SeedanceTierId;
  resolution: "480p" | "720p";
} {
  if (quality === "draft") {
    return { tier: "fast", resolution: "480p" };
  }
  return { tier: "standard", resolution: "720p" };
}

export function normalizeGenerationTier(
  value: string | null | undefined,
): SeedanceTierId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "standard" || normalized === "fast") {
    return normalized;
  }
  return null;
}

/** Fallback when co-pilot omits audio_mode — prefer audio when dialogue is present. */
export function inferAudioModeFromPrompt(prompt: string): SeedanceAudioMode {
  const trimmed = prompt.trim();
  if (!trimmed) return "ambient";

  if (/"[^"]{2,}"/.test(trimmed)) {
    return "full";
  }

  const lower = trimmed.toLowerCase();
  if (
    /\bsays\b/.test(lower) ||
    /\basks\b/.test(lower) ||
    /\bwhispers?\b/.test(lower) ||
    /\bshouts?\b/.test(lower) ||
    /\bmutters?\b/.test(lower)
  ) {
    return "full";
  }

  if (/\b(silent|no audio|without sound)\b/.test(lower)) {
    return "off";
  }

  return "ambient";
}

/** fal Seedance only exposes generate_audio (boolean) — ambient uses the same flag as full. */
export function seedanceGenerateAudio(mode: SeedanceAudioMode): boolean {
  return mode === "full" || mode === "ambient";
}
