import "server-only";

import { isAdmin } from "@/lib/auth/isAdmin";
import { CopilotAbortError, isAbortError } from "@/lib/ai/copilot/abort";
import { getBalance } from "@/lib/credits/balance";
import {
  InsufficientCreditsError,
  insufficientCreditsFromMessage,
} from "@/lib/credits/errors";
import {
  commitReservation,
  releaseReservation,
  reserveCredits,
} from "@/lib/credits/mutations";

export type BillableWorkContext = {
  markBillableWorkStarted: () => void;
};

export async function assertSufficientCredits(
  userId: string,
  estimateCredits: number,
): Promise<void> {
  if (await isAdmin(userId)) {
    return;
  }

  const { available } = await getBalance(userId);
  if (available < estimateCredits) {
    throw new InsufficientCreditsError(estimateCredits, available);
  }
}

/**
 * Single chokepoint for paid generation: reserve once, run provider, commit actual or release on failure.
 * Admins are never blocked by insufficient credits; reserve/commit/release still run (balance may go negative).
 */
export async function withCredits<T>(
  userId: string,
  estimateCredits: number,
  reference: string,
  fn: () => Promise<{ result: T; actualCredits: number }>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  const admin = await isAdmin(userId);
  let reservationId: string | null = null;

  try {
    reservationId = await reserveCredits(userId, estimateCredits, reference, metadata);
  } catch (error) {
    if (admin) {
      throw error instanceof Error
        ? new Error(
            `Admin credit reserve failed unexpectedly (apply migration 013): ${error.message}`,
          )
        : error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message === "insufficient_credits") {
      const { available } = await getBalance(userId);
      throw new InsufficientCreditsError(estimateCredits, available);
    }
    const parsed = insufficientCreditsFromMessage(message, estimateCredits, 0);
    if (parsed) {
      const { available } = await getBalance(userId);
      throw new InsufficientCreditsError(estimateCredits, available);
    }
    throw error;
  }

  try {
    const { result, actualCredits } = await fn();
    await commitReservation(reservationId, actualCredits);
    return result;
  } catch (error) {
    await releaseReservation(reservationId);
    throw error;
  }
}

/**
 * Like withCredits, but on abort commits if billable provider work already started.
 * Errs on the side of commit (never over-refund paid provider work).
 */
export async function withCreditsAbortable<T>(
  userId: string,
  estimateCredits: number,
  reference: string,
  fn: (ctx: BillableWorkContext) => Promise<{ result: T; actualCredits: number }>,
  options?: { abortSignal?: AbortSignal; metadata?: Record<string, unknown> },
): Promise<T> {
  const admin = await isAdmin(userId);
  let reservationId: string | null = null;
  let billableStarted = false;

  const markBillableWorkStarted = () => {
    billableStarted = true;
  };

  const settleOnAbort = async () => {
    if (!reservationId) return;
    if (billableStarted) {
      await commitReservation(reservationId, estimateCredits);
    } else {
      await releaseReservation(reservationId);
    }
  };

  try {
    reservationId = await reserveCredits(
      userId,
      estimateCredits,
      reference,
      options?.metadata,
    );
  } catch (error) {
    if (admin) {
      throw error instanceof Error
        ? new Error(
            `Admin credit reserve failed unexpectedly (apply migration 013): ${error.message}`,
          )
        : error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message === "insufficient_credits") {
      const { available } = await getBalance(userId);
      throw new InsufficientCreditsError(estimateCredits, available);
    }
    const parsed = insufficientCreditsFromMessage(message, estimateCredits, 0);
    if (parsed) {
      const { available } = await getBalance(userId);
      throw new InsufficientCreditsError(estimateCredits, available);
    }
    throw error;
  }

  try {
    if (options?.abortSignal?.aborted) {
      throw new CopilotAbortError();
    }

    const { result, actualCredits } = await fn({ markBillableWorkStarted });

    if (options?.abortSignal?.aborted) {
      if (billableStarted) {
        await commitReservation(reservationId, actualCredits);
      } else {
        await releaseReservation(reservationId);
      }
      throw new CopilotAbortError();
    }

    await commitReservation(reservationId, actualCredits);
    return result;
  } catch (error) {
    if (isAbortError(error)) {
      await settleOnAbort();
      throw error instanceof CopilotAbortError ? error : new CopilotAbortError();
    }
    await releaseReservation(reservationId);
    throw error;
  }
}
