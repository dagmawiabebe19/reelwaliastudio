import "server-only";

import { createHash } from "crypto";
import type { CaptionCue } from "@/lib/captioning/types";
import {
  BURN_EXPORT_RESOLUTION,
} from "@/lib/captioning/burn-export-types";

export {
  BURN_EXPORT_RESOLUTION,
  type BurnExportStatus,
  type CaptionBurnedExportRow,
} from "@/lib/captioning/burn-export-types";

/** Stable fingerprint of timed cues — changes when text or timing edits. */
export function fingerprintCues(cues: CaptionCue[]): string {
  const payload = cues
    .map((c) => `${c.cueIndex}|${c.startMs}|${c.endMs}|${c.text}`)
    .join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function burnedExportStoragePath(
  ownerId: string,
  jobId: string,
  lang: string,
  resolution: string = BURN_EXPORT_RESOLUTION,
): string {
  return `${ownerId}/${jobId}/burned/${resolution}/${lang}.mp4`;
}

export function burnExportCreditReference(
  jobId: string,
  lang: string,
  resolution: string = BURN_EXPORT_RESOLUTION,
): string {
  return `caption-burn-export:${jobId}:${lang}:${resolution}`;
}

export function burnedExportDownloadFilename(input: {
  seriesSlug?: string | null;
  episodeSlug?: string | null;
  jobTitle: string;
  lang: string;
  resolution?: string;
}): string {
  const series = slugify(input.seriesSlug || "series");
  const episode = slugify(input.episodeSlug || input.jobTitle || "episode");
  const res = input.resolution ?? BURN_EXPORT_RESOLUTION;
  return `${series}_${episode}_${input.lang}_${res}_burned.mp4`;
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}

/**
 * Map our caption lang codes to VEED BCP-47 locales.
 * When SRT is provided, this should match the subtitle content language.
 */
export function veedLocaleForCaptionLang(lang: string): string {
  const map: Record<string, string> = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    pt: "pt-BR",
    am: "am-ET",
    de: "de-DE",
    nl: "nl-NL",
    ja: "ja-JP",
    ko: "ko-KR",
    zh: "zh",
    ru: "ru-RU",
    ar: "ar-SA",
    sw: "sw-KE",
  };
  return map[lang] ?? "en-US";
}
