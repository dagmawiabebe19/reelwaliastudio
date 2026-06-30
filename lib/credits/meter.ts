import "server-only";

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

export async function assertSufficientCredits(
  userId: string,
  estimateCredits: number,
): Promise<void> {
  const { available } = await getBalance(userId);
  if (available < estimateCredits) {
    throw new InsufficientCreditsError(estimateCredits, available);
  }
}

/**
 * Single chokepoint for paid generation: reserve once, run provider, commit actual or release on failure.
 */
export async function withCredits<T>(
  userId: string,
  estimateCredits: number,
  reference: string,
  fn: () => Promise<{ result: T; actualCredits: number }>,
  metadata?: Record<string, unknown>,
): Promise<T> {
  let reservationId: string | null = null;

  try {
    reservationId = await reserveCredits(userId, estimateCredits, reference, metadata);
  } catch (error) {
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
