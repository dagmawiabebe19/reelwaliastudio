import { GENERATION_ETA_HINT } from "@/lib/generation/progress";

function isSafetyBlockMessage(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  return (
    /blocked by safety/i.test(error) ||
    /safety filter/i.test(error) ||
    /safety system/i.test(error) ||
    /safety_violations/i.test(error) ||
    /content moderation/i.test(error) ||
    /content blocked/i.test(error)
  );
}

interface GenerationStatusLineProps {
  status?: string | null;
  error?: string | null;
  /** When true, show a green "Done" line for ready state (generated assets). */
  showReady?: boolean;
  /** When false and status is ready, show missing-image warning instead of Done. */
  hasAsset?: boolean;
}

export function GenerationStatusLine({
  status,
  error,
  showReady = true,
  hasAsset = true,
}: GenerationStatusLineProps) {
  if (!status || status === "draft") return null;

  if (status === "pending") {
    return (
      <p className="text-xs text-amber-400">
        Generating… {GENERATION_ETA_HINT}
      </p>
    );
  }

  if (status === "failed") {
    if (isSafetyBlockMessage(error)) {
      return (
        <p className="max-w-full break-words text-xs text-amber-400">
          Blocked by safety filter — prompt adjusted retry available
        </p>
      );
    }
    return (
      <p className="max-w-full break-words text-xs text-accent">
        Failed: {error?.trim() || "Generation failed"}
      </p>
    );
  }

  if (status === "ready" && !hasAsset) {
    return <p className="text-xs text-amber-400">Image missing — regenerate</p>;
  }

  if (status === "ready" && showReady) {
    return <p className="text-xs text-emerald-400">Done</p>;
  }

  return null;
}
