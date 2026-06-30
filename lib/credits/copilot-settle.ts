import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { COPILOT_TURN_CREDITS } from "@/lib/credits/pricing";
import { commitReservation, releaseReservation } from "@/lib/credits/mutations";

export type CopilotTurnBillingSnapshot = {
  anthropicBillable: boolean;
  usage?: Anthropic.Messages.Usage;
};

/**
 * Derive co-pilot turn commit amount from partial usage.
 * Flat COPILOT_TURN_CREDITS when any tokens were generated; 0 when none.
 * When usage is missing but work clearly started, commit the estimate (err on commit side).
 */
export function copilotTurnCreditsFromUsage(
  estimate: number,
  billing: CopilotTurnBillingSnapshot,
): number {
  if (!billing.anthropicBillable) return 0;

  const input = billing.usage?.input_tokens ?? 0;
  const output = billing.usage?.output_tokens ?? 0;
  if (input + output > 0) {
    return Math.min(estimate, COPILOT_TURN_CREDITS);
  }

  // Billable invocation without retrievable usage — commit estimate, do not refund.
  return estimate;
}

/**
 * Settle a co-pilot turn reservation after completion or abort.
 * Never refunds provider work that already occurred.
 */
export async function settleCopilotTurnReservation(
  reservationId: string,
  estimate: number,
  billing: CopilotTurnBillingSnapshot,
  aborted: boolean,
): Promise<"released" | "committed"> {
  if (!aborted) {
    await commitReservation(reservationId, estimate);
    return "committed";
  }

  if (!billing.anthropicBillable) {
    await releaseReservation(reservationId);
    return "released";
  }

  const actual = copilotTurnCreditsFromUsage(estimate, billing);
  if (actual <= 0) {
    await releaseReservation(reservationId);
    return "released";
  }

  await commitReservation(reservationId, actual);
  return "committed";
}
