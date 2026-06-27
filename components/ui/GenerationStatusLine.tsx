import { GENERATION_ETA_HINT } from "@/lib/generation/progress";

interface GenerationStatusLineProps {
  status?: string | null;
  error?: string | null;
  /** When true, show a green "Done" line for ready state (generated assets). */
  showReady?: boolean;
}

export function GenerationStatusLine({
  status,
  error,
  showReady = true,
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
    return (
      <p className="text-xs text-accent">
        Failed: {error?.trim() || "Generation failed"}
      </p>
    );
  }

  if (status === "ready" && showReady) {
    return <p className="text-xs text-emerald-400">Done</p>;
  }

  return null;
}
