import type { SupabaseClient } from "@supabase/supabase-js";

/** Per-type age thresholds — must not overlap legitimate op duration. */
export const ABANDONED_RESERVATION_THRESHOLD_MINUTES = {
  ingredient: 10,
  sheet: 20,
  copilot: 5,
  episodeSummary: 5,
} as const;

export type NonVideoReservationKind = "ingredient" | "sheet" | "copilot" | "episode_summary";

export type ParsedReservationReference =
  | { kind: NonVideoReservationKind; entityId: string }
  | { kind: "video" }
  | { kind: "unknown" };

/** Reference formats used by withCredits / reserveCredits (non-video paths). */
export const RESERVATION_REFERENCE_FORMATS = {
  ingredient: "openai-image:ingredient:<ingredientId>",
  sheet: "openai-image:sheet:<sheetId>",
  copilot: "copilot:session:<chatSessionId>",
  episodeSummary: "episode-summary:<episodeId>",
  video: "seedance:take:<takeId> (handled by take reconcile only)",
} as const;

export type ReconcileReservationOutcome = {
  reservationId: string;
  reference: string | null;
  kind: NonVideoReservationKind | "skipped";
  result: "released" | "skipped";
  reason?: string;
};

export type ReconcileStuckReservationsResult = {
  released: number;
  byKind: Record<NonVideoReservationKind, number>;
  outcomes: ReconcileReservationOutcome[];
};

type LedgerReservationRow = {
  reservation_id: string;
  reference: string | null;
  created_at: string;
};

export type ReservationSweepDb = SupabaseClient;

export function parseReservationReference(reference: string | null): ParsedReservationReference {
  if (!reference?.trim()) return { kind: "unknown" };

  const ingredient = reference.match(/^openai-image:ingredient:([0-9a-f-]{36})$/i);
  if (ingredient) return { kind: "ingredient", entityId: ingredient[1] };

  const sheet = reference.match(/^openai-image:sheet:([0-9a-f-]{36})$/i);
  if (sheet) return { kind: "sheet", entityId: sheet[1] };

  const copilot = reference.match(/^copilot:session:([0-9a-f-]{36})$/i);
  if (copilot) return { kind: "copilot", entityId: copilot[1] };

  const summary = reference.match(/^episode-summary:([0-9a-f-]{36})$/i);
  if (summary) return { kind: "episode_summary", entityId: summary[1] };

  if (/^seedance:take:[0-9a-f-]{36}$/i.test(reference)) return { kind: "video" };

  return { kind: "unknown" };
}

function thresholdMinutesForKind(kind: NonVideoReservationKind): number {
  switch (kind) {
    case "ingredient":
      return ABANDONED_RESERVATION_THRESHOLD_MINUTES.ingredient;
    case "sheet":
      return ABANDONED_RESERVATION_THRESHOLD_MINUTES.sheet;
    case "copilot":
      return ABANDONED_RESERVATION_THRESHOLD_MINUTES.copilot;
    case "episode_summary":
      return ABANDONED_RESERVATION_THRESHOLD_MINUTES.episodeSummary;
  }
}

function ageMinutes(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / 60_000;
}

async function isEntityLiveInProgress(
  db: ReservationSweepDb,
  kind: NonVideoReservationKind,
  entityId: string,
  thresholdMinutes: number,
): Promise<boolean> {
  if (kind === "ingredient") {
    const { data, error } = await db
      .from("ingredients")
      .select("generation_status, updated_at")
      .eq("id", entityId)
      .maybeSingle();
    if (error) throw new Error(`ingredient liveness check failed: ${error.message}`);
    if (!data) return false;
    if (data.generation_status !== "pending") return false;
    return ageMinutes(data.updated_at) < thresholdMinutes;
  }

  if (kind === "sheet") {
    const { data, error } = await db
      .from("character_sheets")
      .select("status, updated_at")
      .eq("id", entityId)
      .maybeSingle();
    if (error) throw new Error(`sheet liveness check failed: ${error.message}`);
    if (!data) return false;
    if (data.status !== "pending") return false;
    return ageMinutes(data.updated_at) < thresholdMinutes;
  }

  return false;
}

async function listCandidateReservationRows(db: ReservationSweepDb): Promise<LedgerReservationRow[]> {
  const minThreshold = Math.min(...Object.values(ABANDONED_RESERVATION_THRESHOLD_MINUTES));
  const olderThan = new Date(Date.now() - minThreshold * 60_000).toISOString();

  const { data, error } = await db
    .from("credit_ledger")
    .select("reservation_id, reference, created_at, type, status")
    .eq("type", "reservation")
    .eq("status", "reserved")
    .not("reservation_id", "is", null)
    .lt("created_at", olderThan)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`list open reservations failed: ${error.message}`);

  const byId = new Map<string, LedgerReservationRow>();
  for (const row of data ?? []) {
    if (!row.reservation_id) continue;
    if (!byId.has(row.reservation_id)) {
      byId.set(row.reservation_id, {
        reservation_id: row.reservation_id,
        reference: row.reference,
        created_at: row.created_at,
      });
    }
  }
  return [...byId.values()];
}

export async function reconcileStuckReservationsCore(input: {
  db: ReservationSweepDb;
  releaseReservation: (reservationId: string) => Promise<void>;
  isReservationOpen: (reservationId: string) => Promise<boolean>;
  onReleaseError?: (error: unknown, context: { reservationId: string; reference: string | null }) => void;
}): Promise<ReconcileStuckReservationsResult> {
  const byKind: Record<NonVideoReservationKind, number> = {
    ingredient: 0,
    sheet: 0,
    copilot: 0,
    episode_summary: 0,
  };
  const outcomes: ReconcileReservationOutcome[] = [];
  const candidates = await listCandidateReservationRows(input.db);

  for (const row of candidates) {
    const reservationId = row.reservation_id;
    const parsed = parseReservationReference(row.reference);

    if (parsed.kind === "video") {
      outcomes.push({
        reservationId,
        reference: row.reference,
        kind: "skipped",
        result: "skipped",
        reason: "video_take_owned_by_take_reconcile",
      });
      continue;
    }

    if (parsed.kind === "unknown") {
      outcomes.push({
        reservationId,
        reference: row.reference,
        kind: "skipped",
        result: "skipped",
        reason: "unknown_reference",
      });
      continue;
    }

    const threshold = thresholdMinutesForKind(parsed.kind);
    if (ageMinutes(row.created_at) < threshold) {
      outcomes.push({
        reservationId,
        reference: row.reference,
        kind: parsed.kind,
        result: "skipped",
        reason: "within_age_threshold",
      });
      continue;
    }

    try {
      const open = await input.isReservationOpen(reservationId);
      if (!open) {
        outcomes.push({
          reservationId,
          reference: row.reference,
          kind: parsed.kind,
          result: "skipped",
          reason: "not_open",
        });
        continue;
      }

      const live = await isEntityLiveInProgress(input.db, parsed.kind, parsed.entityId, threshold);
      if (live) {
        outcomes.push({
          reservationId,
          reference: row.reference,
          kind: parsed.kind,
          result: "skipped",
          reason: "entity_still_in_progress",
        });
        continue;
      }

      await input.releaseReservation(reservationId);
      byKind[parsed.kind] += 1;
      outcomes.push({
        reservationId,
        reference: row.reference,
        kind: parsed.kind,
        result: "released",
      });
    } catch (error) {
      input.onReleaseError?.(error, { reservationId, reference: row.reference });
      outcomes.push({
        reservationId,
        reference: row.reference,
        kind: parsed.kind,
        result: "skipped",
        reason: error instanceof Error ? error.message : "release_error",
      });
    }
  }

  const released = Object.values(byKind).reduce((sum, n) => sum + n, 0);
  return { released, byKind, outcomes };
}
