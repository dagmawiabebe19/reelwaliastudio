"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

interface DeleteConfirmButtonProps {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  fetchPreview: () => Promise<{ title: string; message: string } | { error: string }>;
  onDelete: () => Promise<{ error?: string } | void>;
  onSuccess?: () => void;
}

export function DeleteConfirmButton({
  ariaLabel = "Delete",
  className = "",
  disabled,
  fetchPreview,
  onDelete,
  onSuccess,
}: DeleteConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ title: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpen() {
    setError(null);
    startTransition(async () => {
      const result = await fetchPreview();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPreview(result);
      setOpen(true);
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setPreview(null);
      onSuccess?.();
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled || pending}
        onClick={(e) => {
          e.stopPropagation();
          handleOpen();
        }}
        className={`focus-ring studio-icon-btn studio-icon-btn--danger disabled:opacity-50 ${className}`}
      >
        <Trash2 className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
      </button>

      {open && preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-surface-elevated p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg text-foreground">{preview.title}</h3>
            <p className="mt-2 text-sm text-muted">{preview.message}</p>
            {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="focus-ring studio-btn studio-btn-ghost !min-h-8 !px-3 !py-1.5 !text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handleConfirm}
                className="focus-ring studio-btn studio-btn-primary !min-h-8 !px-3 !py-1.5 !text-sm"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
