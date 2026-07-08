import { SOURCE_LANG } from "@/lib/captioning/types";

export interface CaptionLanguage {
  code: string;
  label: string;
  /** Endonym / script hint used to steer the translation model. */
  nativeName: string;
  rtl: boolean;
}

/** Target languages for translation (English is the transcription source). */
export const TARGET_LANGUAGES: CaptionLanguage[] = [
  { code: "es", label: "Spanish", nativeName: "Español", rtl: false },
  { code: "fr", label: "French", nativeName: "Français", rtl: false },
  { code: "pt", label: "Portuguese", nativeName: "Português", rtl: false },
  { code: "am", label: "Amharic", nativeName: "አማርኛ (Ethiopic script)", rtl: false },
  { code: "de", label: "German", nativeName: "Deutsch", rtl: false },
  { code: "nl", label: "Dutch", nativeName: "Nederlands", rtl: false },
  { code: "ja", label: "Japanese", nativeName: "日本語", rtl: false },
  { code: "ko", label: "Korean", nativeName: "한국어", rtl: false },
  { code: "zh", label: "Mandarin Chinese", nativeName: "简体中文", rtl: false },
  { code: "ru", label: "Russian", nativeName: "Русский", rtl: false },
  { code: "ar", label: "Arabic", nativeName: "العربية", rtl: true },
  { code: "sw", label: "Swahili", nativeName: "Kiswahili", rtl: false },
];

export const SOURCE_LANGUAGE: CaptionLanguage = {
  code: SOURCE_LANG,
  label: "English",
  nativeName: "English",
  rtl: false,
};

export const ALL_LANGUAGES: CaptionLanguage[] = [SOURCE_LANGUAGE, ...TARGET_LANGUAGES];

export const TARGET_LANGUAGE_CODES = TARGET_LANGUAGES.map((l) => l.code);

export function getLanguage(code: string): CaptionLanguage | undefined {
  return ALL_LANGUAGES.find((l) => l.code === code);
}

export function getLanguageLabel(code: string): string {
  return getLanguage(code)?.label ?? code.toUpperCase();
}

export function isTargetLanguage(code: string): boolean {
  return TARGET_LANGUAGE_CODES.includes(code);
}
