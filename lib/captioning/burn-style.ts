import { getEnv } from "@/lib/ai/shared";

/**
 * Styling config for burned-in English captions on vertical social video.
 *
 * Rendered by fal's veed/subtitles. Configurable via env so you can tune the
 * look without code edits. VEED governs pixel font-size through its preset;
 * we expose the controls VEED actually supports: preset, vertical position,
 * contrast (shadow), font family, weight, and colour.
 */
export interface BurnInStyle {
  preset: string;
  position: "top" | "center" | "bottom";
  shadow: "none" | "min" | "mid" | "max";
  font?: string;
  fontWeight: number;
  color: string;
}

const DEFAULT_STYLE: BurnInStyle = {
  // Basic preset (1× billing), clean and legible for 9:16 social.
  preset: "simple",
  // Bottom, safe-area aware in VEED's renderer — clear of top/bottom mobile UI.
  position: "bottom",
  // Strong contrast over any footage.
  shadow: "max",
  font: undefined,
  // Bold for phone readability on muted autoplay.
  fontWeight: 800,
  color: "#FFFFFF",
};

function normalizePosition(value: string | undefined): BurnInStyle["position"] {
  if (value === "top" || value === "center" || value === "bottom") return value;
  return DEFAULT_STYLE.position;
}

function normalizeShadow(value: string | undefined): BurnInStyle["shadow"] {
  if (value === "none" || value === "min" || value === "mid" || value === "max") return value;
  return DEFAULT_STYLE.shadow;
}

export function getBurnInStyle(): BurnInStyle {
  const weightRaw = Number(getEnv("CAPTION_BURN_FONT_WEIGHT"));
  const fontWeight =
    Number.isFinite(weightRaw) && weightRaw >= 100 && weightRaw <= 900
      ? Math.round(weightRaw)
      : DEFAULT_STYLE.fontWeight;

  return {
    preset: getEnv("CAPTION_BURN_PRESET")?.trim() || DEFAULT_STYLE.preset,
    position: normalizePosition(getEnv("CAPTION_BURN_POSITION") ?? undefined),
    shadow: normalizeShadow(getEnv("CAPTION_BURN_SHADOW") ?? undefined),
    font: getEnv("CAPTION_BURN_FONT")?.trim() || undefined,
    fontWeight,
    color: getEnv("CAPTION_BURN_COLOR")?.trim() || DEFAULT_STYLE.color,
  };
}
