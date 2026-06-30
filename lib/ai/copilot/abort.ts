import "server-only";

export class CopilotAbortError extends Error {
  constructor(message = "Co-pilot turn stopped.") {
    super(message);
    this.name = "CopilotAbortError";
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof CopilotAbortError) return true;
  if (error instanceof Error) {
    if (error.name === "AbortError") return true;
    if (/abort/i.test(error.message)) return true;
  }
  return false;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CopilotAbortError();
  }
}
