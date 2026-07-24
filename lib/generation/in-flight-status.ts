/**
 * In-flight generation statuses that warrant polling.
 * Anything else (ready, failed, draft, archived, rejected, cancelled, blocked, null, …)
 * is treated as terminal for polling purposes.
 */
const IN_FLIGHT = new Set([
  "pending",
  "generating",
  "queued",
  "translating",
  "processing",
  "running",
  "in_progress",
]);

export function isInFlightGenerationStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return IN_FLIGHT.has(status.trim().toLowerCase());
}

/** Stable fingerprint of id→status maps so polls can skip no-op setState. */
export function statusFingerprint(
  rows: Array<{ id: string; status: string | null | undefined }>,
): string {
  return rows
    .map((row) => `${row.id}:${row.status ?? ""}`)
    .sort()
    .join("|");
}
