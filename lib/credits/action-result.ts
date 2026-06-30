import { isInsufficientCreditsError, toInsufficientCreditsPayload } from "@/lib/credits/errors";

export type ActionErrorResult = {
  error: string;
  insufficientCredits?: { needed: number; available: number };
};

export function formatActionError(error: unknown, fallback: string): ActionErrorResult {
  if (isInsufficientCreditsError(error)) {
    return {
      error: `Not enough credits. Need ${error.needed}, you have ${error.available}.`,
      insufficientCredits: toInsufficientCreditsPayload(error),
    };
  }

  return {
    error: error instanceof Error ? error.message : fallback,
  };
}
