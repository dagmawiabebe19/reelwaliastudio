"use client";

import { RotateCcw } from "lucide-react";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { ICON_SM, ICON_STROKE } from "@/components/ui/icon";

type DeletePreviewResult = { title: string; message: string } | { error: string };
type DeleteResult = { error?: string } | void;

interface FailedGenerationControlsProps {
  disabled?: boolean;
  onRetry: () => void;
  /** When true, label retry as a safety-adjusted regenerate. */
  safetyBlocked?: boolean;
  deleteAriaLabel?: string;
  deleteClassName?: string;
  fetchDeletePreview: () => Promise<DeletePreviewResult>;
  onDelete: () => Promise<DeleteResult>;
  onSuccess?: () => void;
  size?: "sm" | "md";
}

const retrySizeClass: Record<NonNullable<FailedGenerationControlsProps["size"]>, string> = {
  sm: "studio-btn studio-btn-secondary !min-h-6 !px-1.5 !py-0.5 !text-[9px]",
  md: "studio-btn studio-btn-secondary !min-h-7 !px-2 !py-1 !text-[10px]",
};

/** Retry + delete controls for failed sheets and ingredients (shared styling). */
export function FailedGenerationControls({
  disabled,
  onRetry,
  safetyBlocked = false,
  deleteAriaLabel = "Delete failed item",
  deleteClassName = "!min-h-6 !min-w-6",
  fetchDeletePreview,
  onDelete,
  onSuccess,
  size = "sm",
}: FailedGenerationControlsProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          onRetry();
        }}
        className={`focus-ring inline-flex items-center gap-1 ${retrySizeClass[size]}`}
        title={
          safetyBlocked
            ? "Retry with a sanitized identity-only headshot prompt"
            : undefined
        }
      >
        <RotateCcw className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
        {safetyBlocked ? "Retry (adjusted)" : "Retry"}
      </button>
      <DeleteConfirmButton
        ariaLabel={deleteAriaLabel}
        className={deleteClassName}
        disabled={disabled}
        fetchPreview={fetchDeletePreview}
        onDelete={onDelete}
        onSuccess={onSuccess}
      />
    </div>
  );
}
