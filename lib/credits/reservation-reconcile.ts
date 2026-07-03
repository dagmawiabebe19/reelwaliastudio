import "server-only";

import { releaseReservation } from "@/lib/credits/mutations";
import { isReservationOpen } from "@/lib/credits/reservations";
import {
  reconcileStuckReservationsCore,
  type ReconcileStuckReservationsResult,
} from "@/lib/credits/reservation-sweep-core";
import type { ServiceDbClient } from "@/lib/db/service-client";
import { createAdminClient } from "@/lib/supabase/admin";

export {
  ABANDONED_RESERVATION_THRESHOLD_MINUTES,
  RESERVATION_REFERENCE_FORMATS,
  parseReservationReference,
  type NonVideoReservationKind,
  type ParsedReservationReference,
  type ReconcileReservationOutcome,
  type ReconcileStuckReservationsResult,
} from "@/lib/credits/reservation-sweep-core";

export type ReservationReconcileOps = {
  db: ServiceDbClient;
};

function logReservationSweepError(label: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[reservation-sweep] ${label} failed`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

function runDetached(label: string, task: () => Promise<void>, context?: Record<string, unknown>): void {
  void Promise.resolve()
    .then(task)
    .catch((error) => {
      logReservationSweepError(label, error, context);
    });
}

export async function reconcileStuckReservations(input?: {
  ops?: ReservationReconcileOps;
}): Promise<ReconcileStuckReservationsResult> {
  const db = input?.ops?.db ?? createAdminClient();
  return reconcileStuckReservationsCore({
    db,
    releaseReservation,
    isReservationOpen,
    onReleaseError: (error, ctx) => {
      logReservationSweepError("release abandoned reservation", error, ctx);
    },
  });
}

export function scheduleStartupStuckReservationSweep(): void {
  const ops: ReservationReconcileOps = { db: createAdminClient() };
  runDetached("startup sweep", async () => {
    const { released, byKind } = await reconcileStuckReservations({ ops });
    console.log(
      `[reservation-sweep] released ${released} abandoned reservations ` +
        `(image:${byKind.ingredient} sheet:${byKind.sheet} copilot:${byKind.copilot} summary:${byKind.episode_summary})`,
    );
  });
}
