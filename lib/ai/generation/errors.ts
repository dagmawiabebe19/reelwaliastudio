import "server-only";

export function formatGenerationError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return fallback;
}

export function logGenerationError(
  scope: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const message = formatGenerationError(error, "Unknown error");
  console.error(`[generation:${scope}]`, {
    message,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
    ...meta,
  });
}
