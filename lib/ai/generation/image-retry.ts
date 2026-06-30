import "server-only";

import { classifyImageError } from "@/lib/ai/generation/image-errors";

const IMAGE_RETRY_BACKOFF_MS = [1000, 2000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient OpenAI image failures (mirrors Seedance submit retry pattern).
 * Fails fast on moderation / validation errors.
 */
export async function withImageRetries<T>(
  label: string,
  fn: () => Promise<T>,
  options?: { abortSignal?: AbortSignal },
): Promise<T> {
  const maxAttempts = 1 + IMAGE_RETRY_BACKOFF_MS.length;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options?.abortSignal?.aborted) {
      throw options.abortSignal.reason ?? new Error("Image generation aborted.");
    }

    if (attempt > 0) {
      const backoffMs = IMAGE_RETRY_BACKOFF_MS[attempt - 1];
      console.log(
        "[image-retry]",
        JSON.stringify({
          label,
          attempt: attempt + 1,
          maxAttempts,
          backoffMs,
          previousError:
            lastError instanceof Error ? lastError.message : String(lastError ?? ""),
        }),
      );
      await sleep(backoffMs);
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const classified = classifyImageError(error);
      const canRetry = classified.retryable && attempt < maxAttempts - 1;
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error(`Image generation failed for ${label}.`);
}
