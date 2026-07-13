/**
 * Shared Seedance likeness-rejection helpers (safe for client + server).
 * Official fal Seedance reference-to-video schema has no consent/allow-likeness parameter.
 */

export function isSeedanceLikenessText(message: string): boolean {
  const haystack = message.toLowerCase();
  return (
    haystack.includes("likeness") ||
    haystack.includes("likenesses of real people") ||
    haystack.includes("real people") ||
    haystack.includes("real person") ||
    haystack.includes("real-person") ||
    haystack.includes("privacyinformation") ||
    /may contain (?:a )?real[ -]?person/.test(haystack) ||
    /rejected:\s*reference flagged as real-person likeness/i.test(message)
  );
}

export function formatSeedanceLikenessRejection(referenceLabels: string[]): string {
  const refs = referenceLabels.map((label) => label.trim()).filter(Boolean);
  const list = refs.length ? refs.join("; ") : "(no labels)";
  return `Rejected: reference flagged as real-person likeness. References sent: ${list}`;
}

export function parseLikenessRejectionMessage(message: string | null | undefined): {
  isLikeness: boolean;
  references: string[];
} {
  if (!message?.trim()) return { isLikeness: false, references: [] };
  if (!isSeedanceLikenessText(message)) return { isLikeness: false, references: [] };

  const match = message.match(/References sent:\s*(.+)$/i);
  const references = match
    ? match[1]
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part && part !== "(no labels)")
    : [];
  return { isLikeness: true, references };
}

export function getLikenessRejectionDisplay(errorMessage: string | null | undefined): {
  isLikeness: boolean;
  references: string[];
  headline: string;
  detail: string | null;
} {
  const parsed = parseLikenessRejectionMessage(errorMessage);
  if (!parsed.isLikeness) {
    return {
      isLikeness: false,
      references: [],
      headline: "Generation failed",
      detail: errorMessage?.trim() || null,
    };
  }

  return {
    isLikeness: true,
    references: parsed.references,
    headline: "Rejected: reference flagged as real-person likeness",
    detail: parsed.references.length
      ? `References sent: ${parsed.references.join("; ")}`
      : errorMessage?.trim() || null,
  };
}
