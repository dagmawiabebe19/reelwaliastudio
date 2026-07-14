"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelFalSafeBatchRestyleAction,
  confirmDraftTestPassedAction,
  startFalSafeBatchRestyleAction,
  updateSeriesReferenceStyleAction,
} from "@/app/(app)/series/[id]/restyle-actions";
import { DEFAULT_REFERENCE_STYLE, parseRestyleCascade } from "@/lib/production/reference-style";
import type { Json } from "@/lib/db/database.types";

interface SeriesReferenceStylePanelProps {
  seriesId: string;
  initialReferenceStyle: string | null;
  restyleCascade: Json | null;
  characterCount: number;
}

export function SeriesReferenceStylePanel({
  seriesId,
  initialReferenceStyle,
  restyleCascade,
  characterCount,
}: SeriesReferenceStylePanelProps) {
  const router = useRouter();
  const [style, setStyle] = useState(initialReferenceStyle?.trim() || DEFAULT_REFERENCE_STYLE);
  const [saved, setSaved] = useState(style);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cascade = parseRestyleCascade(restyleCascade);
  const dirty = style !== saved;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface-elevated p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Fal-safe reference style</h3>
          <p className="mt-1 text-xs text-muted">
            Appended to every character headshot and sheet prompt for this series so restyles stay
            consistent and clear Seedance&apos;s likeness filter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => {
              setError(null);
              setNote(null);
              startTransition(async () => {
                const result = await updateSeriesReferenceStyleAction(seriesId, style);
                if ("error" in result && typeof result.error === "string") {
                  setError(result.error);
                  return;
                }
                if ("referenceStyle" in result) {
                  setSaved(result.referenceStyle ?? style);
                  setStyle(result.referenceStyle ?? style);
                }
                router.refresh();
              });
            }}
            className="studio-btn studio-btn-secondary !min-h-8 !px-3 !text-xs"
          >
            {pending && dirty ? "Saving…" : "Save style"}
          </button>
          {characterCount > 0 ? (
            <button
              type="button"
              disabled={pending || Boolean(cascade && cascade.status !== "complete" && cascade.status !== "cancelled" && cascade.status !== "idle")}
              onClick={() => {
                if (
                  !window.confirm(
                    `Restyle all ${characterCount} characters sequentially? The cascade pauses after the first character until you confirm a Draft Seedance test passed.`,
                  )
                ) {
                  return;
                }
                setError(null);
                setNote(null);
                startTransition(async () => {
                  const result = await startFalSafeBatchRestyleAction(seriesId);
                  if ("error" in result && typeof result.error === "string") {
                    setError(result.error);
                    return;
                  }
                  setNote(
                    "note" in result && typeof result.note === "string"
                      ? result.note
                      : "Batch restyle started.",
                  );
                  router.refresh();
                });
              }}
              className="studio-btn studio-btn-ghost !min-h-8 !px-3 !text-xs"
            >
              Restyle all characters
            </button>
          ) : null}
        </div>
      </div>

      <textarea
        value={style}
        onChange={(e) => setStyle(e.target.value)}
        rows={3}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        placeholder={DEFAULT_REFERENCE_STYLE}
      />

      {cascade && cascade.status !== "complete" && cascade.status !== "cancelled" ? (
        <div className="space-y-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
          <p>
            Batch cascade: <span className="text-foreground">{cascade.status.replace(/_/g, " ")}</span>
            {" · "}
            character {Math.min(cascade.index + 1, cascade.characterIds.length)} of{" "}
            {cascade.characterIds.length}
          </p>
          {cascade.status === "awaiting_draft_test" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await confirmDraftTestPassedAction(seriesId);
                    if ("error" in result && typeof result.error === "string") {
                      setError(result.error);
                      return;
                    }
                    setNote(
                      "cascade" in result && result.cascade?.status === "complete"
                        ? "Cascade complete."
                        : "Draft confirmed — continuing to the next character.",
                    );
                    router.refresh();
                  });
                }}
                className="studio-btn studio-btn-secondary !min-h-7 !px-2 !text-[11px]"
              >
                Draft test passed — continue cascade
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    await cancelFalSafeBatchRestyleAction(seriesId);
                    router.refresh();
                  });
                }}
                className="studio-btn studio-btn-ghost !min-h-7 !px-2 !text-[11px]"
              >
                Cancel cascade
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await cancelFalSafeBatchRestyleAction(seriesId);
                  router.refresh();
                });
              }}
              className="studio-btn studio-btn-ghost !min-h-7 !px-2 !text-[11px]"
            >
              Cancel cascade
            </button>
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs text-accent">{error}</p> : null}
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </section>
  );
}
