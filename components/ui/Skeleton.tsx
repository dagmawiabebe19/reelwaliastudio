import type { ReactNode } from "react";

interface SkeletonProps {
  className?: string;
}

/** Shimmer block — use for text rows, panels, and placeholders. */
export function Skeleton({ className = "h-4 w-full rounded-md" }: SkeletonProps) {
  return <div className={`studio-skeleton ${className}`} aria-hidden />;
}

/** Square thumbnail shimmer for ingredient/take previews. */
export function SkeletonThumbnail({ className = "h-full w-full" }: SkeletonProps) {
  return <div className={`studio-skeleton rounded-sm ${className}`} aria-hidden />;
}

/** Calm warm-dark spinner for panel-level loading. */
export function LoadingSpinner({
  className = "",
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-label={label}
    >
      <span className="studio-spinner" aria-hidden />
    </div>
  );
}

/** Centered loading block with spinner + muted label. */
export function LoadingPlaceholder({
  label = "Loading",
  children,
}: {
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <LoadingSpinner label={label} />
      <p className="text-xs text-muted">{children ?? `${label}…`}</p>
    </div>
  );
}

/** Generating pulse — consistent with studio status-progress tokens. */
export function GeneratingPulse({
  label,
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center ${compact ? "gap-0.5" : "gap-2"}`}>
      <span
        className={compact ? "studio-generating-pulse studio-generating-pulse--sm" : "studio-generating-pulse"}
        aria-hidden
      />
      {label ? (
        <p className={compact ? "text-[9px] text-status-progress" : "text-sm text-status-progress"}>
          {label}
        </p>
      ) : null}
    </div>
  );
}
