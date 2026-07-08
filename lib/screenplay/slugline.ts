const SLUGLINE_RE =
  /^(?:(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+)(.+?)(?:\s*[-–—]\s*(.+))?$/i;

const TRANSITION_RE =
  /^(?:CUT TO:|SMASH CUT TO:|MATCH CUT TO:|DISSOLVE TO:|FADE IN:|FADE OUT\.|FADE TO(?:\s+BLACK)?\.?|TIME CUT:|INTERCUT:|END INTERCUT|TO:|BACK TO:)/i;

export function isSlugline(line: string): boolean {
  const trimmed = line.trim();
  return /^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+/i.test(trimmed);
}

export function parseSlugline(slugline: string): {
  intExt: string;
  location: string;
  timeOfDay: string;
} {
  const trimmed = slugline.trim();
  const match = trimmed.match(SLUGLINE_RE);
  if (!match) {
    return { intExt: "", location: trimmed, timeOfDay: "" };
  }

  const intExt = match[1].toUpperCase().replace(/\./g, "").replace(/\//g, "/");
  const location = (match[2] ?? "").trim();
  const timeOfDay = (match[3] ?? "").trim().toUpperCase();

  return { intExt, location, timeOfDay };
}

export function isTransition(line: string): boolean {
  return TRANSITION_RE.test(line.trim());
}

export function isCharacterCue(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isSlugline(trimmed) || isTransition(trimmed)) return false;
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return false;

  const withoutParen = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!withoutParen || withoutParen.length > 40) return false;
  if (!/^[A-Z0-9][A-Z0-9 '.-]*$/.test(withoutParen)) return false;
  if (/^(CONT'D|CONTINUED|MORE|OMIT|THE END|END OF|TITLE CARD)/.test(withoutParen)) {
    return false;
  }

  return true;
}

export function normalizeCharacterName(cue: string): string {
  return cue
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}
