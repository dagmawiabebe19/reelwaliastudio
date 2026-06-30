import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import {
  copilotTurnCreditsFromUsage,
  estimateCopilotTurnCredits,
} from "@/lib/credits/pricing";
import { commitReservation, releaseReservation } from "@/lib/credits/mutations";

export type CopilotTurnBillingSnapshot = {
  anthropicBillable: boolean;
  usage?: Anthropic.Messages.Usage;
};

/**
 * Derive co-pilot turn commit amount from accumulated Anthropic usage.
 * Falls back to reserve estimate when billable but usage telemetry is missing.
 */
export function resolveCopilotTurnCommitCredits(
  modelId: string,
  reserveEstimate: number,
  billing: CopilotTurnBillingSnapshot,
): number {
  if (!billing.anthropicBillable) return 0;

  if (billing.usage) {
    const input = billing.usage.input_tokens ?? 0;
    const output = billing.usage.output_tokens ?? 0;
    const cacheCreate = billing.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = billing.usage.cache_read_input_tokens ?? 0;
    if (input + output + cacheCreate + cacheRead > 0) {
      return copilotTurnCreditsFromUsage(modelId, billing.usage);
    }
  }

  return reserveEstimate;
}

/**
 * Settle a co-pilot turn reservation after completion, abort, or error.
 * Never refunds provider work that already occurred.
 */
export async function settleCopilotTurnReservation(
  reservationId: string,
  modelId: string,
  billing: CopilotTurnBillingSnapshot,
): Promise<"released" | "committed"> {
  const reserveEstimate = estimateCopilotTurnCredits(modelId);
  const actual = resolveCopilotTurnCommitCredits(modelId, reserveEstimate, billing);

  if (actual <= 0) {
    await releaseReservation(reservationId);
    return "released";
  }

  await commitReservation(reservationId, actual);
  return "committed";
}
