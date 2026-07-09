import "server-only";

export type ImageErrorCategory =
  | "moderation"
  | "transient"
  | "validation"
  | "stream_lifecycle"
  | "unknown";

export function classifyImageError(error: unknown): {
  category: ImageErrorCategory;
  message: string;
  retryable: boolean;
} {
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
        ? error.trim()
        : "Image generation failed.";

  const lower = message.toLowerCase();

  if (
    /moderat/i.test(message) ||
    /content blocked/i.test(message) ||
    /safety system/i.test(message) ||
    /safety_violations/i.test(message) ||
    /blocked by safety/i.test(message) ||
    /policy/i.test(lower)
  ) {
    return {
      category: "moderation",
      message,
      retryable: false,
    };
  }

  if (
    /controller is already closed/i.test(message) ||
    /aborted/i.test(lower) ||
    /abort/i.test(lower)
  ) {
    return {
      category: "stream_lifecycle",
      message,
      retryable: true,
    };
  }

  if (
    /rate limit/i.test(lower) ||
    /\b429\b/.test(message) ||
    /\b502\b/.test(message) ||
    /\b503\b/.test(message) ||
    /\b504\b/.test(message) ||
    /\b5\d{2}\b/.test(message) ||
    /timeout/i.test(lower) ||
    /timed out/i.test(lower) ||
    /econnreset/i.test(lower) ||
    /network/i.test(lower) ||
    /fetch failed/i.test(lower) ||
    /failed to fetch/i.test(lower) ||
    /failed to fetch reference image/i.test(lower) ||
    /socket hang up/i.test(lower) ||
    /econnrefused/i.test(lower) ||
    /enotfound/i.test(lower)
  ) {
    return {
      category: "transient",
      message,
      retryable: true,
    };
  }

  if (
    /required/i.test(lower) ||
    /not found/i.test(lower) ||
    /invalid/i.test(lower) ||
    /verification required/i.test(lower) ||
    /\b400\b/.test(message)
  ) {
    return {
      category: "validation",
      message,
      retryable: false,
    };
  }

  return {
    category: "unknown",
    message,
    retryable: false,
  };
}

export function moderationUserMessage(): string {
  return "Blocked by safety filter — prompt adjusted retry available";
}

export function isSafetyRejectionError(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  return classifyImageError(new Error(error)).category === "moderation";
}
