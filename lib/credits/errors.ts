export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits" as const;

  constructor(
    readonly needed: number,
    readonly available: number,
  ) {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
  }
}

export function isInsufficientCreditsError(
  error: unknown,
): error is InsufficientCreditsError {
  return error instanceof InsufficientCreditsError;
}

export function insufficientCreditsFromMessage(
  message: string,
  needed: number,
  available: number,
): InsufficientCreditsError | null {
  if (message !== "insufficient_credits") {
    return null;
  }
  return new InsufficientCreditsError(needed, available);
}

export type InsufficientCreditsPayload = {
  needed: number;
  available: number;
};

export function toInsufficientCreditsPayload(
  error: InsufficientCreditsError,
): InsufficientCreditsPayload {
  return { needed: error.needed, available: error.available };
}
