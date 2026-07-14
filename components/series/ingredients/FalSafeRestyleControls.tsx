"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  approveFalSafeRestyleSheetsAction,
  cancelFalSafeRestyleAction,
  listDraftTestSegmentsAction,
  runFalSafeDraftTestAction,
  startFalSafeRestyleAction,
  syncFalSafeRestylePhaseAction,
} from "@/app/(app)/series/[id]/restyle-actions";
import { CreditCostHint } from "@/components/credits/CreditCostHint";
import { estimateImageCredits, estimateSheetCredits } from "@/lib/credits/pricing";
import type { IngredientCardData } from "@/lib/production/types";

type DraftSegment = {
  sceneId: string;
  episodeId: string;
  sceneTitle: string;
  episodeTitle: string;
  sheetId: string;
  sheetName: string;
};

interface FalSafeRestyleControlsProps {
  seriesId: string;
  character: IngredientCardData;
  sheetCount: number;
}

export function FalSafeRestyleControls({
  seriesId,
  character,
  sheetCount,
}: FalSafeRestyleControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  const phase = character.restylePhase ?? null;

  useEffect(() => {
    if (
      phase !== "headshot_pending" &&
      phase !== "sheets_pending" &&
      character.generationStatus !== "pending"
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      startTransition(async () => {
        await syncFalSafeRestylePhaseAction(seriesId, character.id);
        router.refresh();
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [phase, character.generationStatus, character.id, seriesId, router]);

  useEffect(() => {
    if (phase !== "ready_for_draft_test" && phase !== "complete" && !character.falSafeStyled) {
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await listDraftTestSegmentsAction(seriesId, character.id);
      if (cancelled) return;
      if ("segments" in result && Array.isArray(result.segments)) {
        setSegments(result.segments);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, character.falSafeStyled, character.id, seriesId]);

  function run(action: () => Promise<Record<string, unknown>>) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result && typeof result.error === "string") {
        setError(result.error);
        return;
      }
      if ("note" in result && typeof result.note === "string") setNote(result.note);
      router.refresh();
    });
  }

  const showApprove =
    phase === "awaiting_sheet_approval" ||
    (phase === "headshot_pending" && character.generationStatus === "ready");
  const showDraftTests =
    phase === "ready_for_draft_test" ||
    phase === "complete" ||
    (character.falSafeStyled && sheetCount > 0);

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs uppercase tracking-widest text-muted">Fal-safe restyle</p>
        {character.falSafeStyled ? (
          <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">
            fal-safe styled
          </span>
        ) : (
          <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">
            pre-restyle
          </span>
        )}
        {phase ? (
          <span className="text-[10px] text-muted">{phase.replace(/_/g, " ")}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || character.generationStatus === "pending" || phase === "sheets_pending"}
          onClick={() => {
            if (
              !window.confirm(
                `Regenerate ${character.name}'s headshot with the series fal-safe style? You will approve before sheets regenerate.`,
              )
            ) {
              return;
            }
            run(() => startFalSafeRestyleAction(seriesId, character.id));
          }}
          className="studio-btn studio-btn-secondary !min-h-7 !px-2 !text-[11px]"
        >
          Restyle references (fal-safe)
        </button>
        <CreditCostHint cost={estimateImageCredits(1)} available={null} />
      </div>

      {showApprove ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
          <p className="text-xs text-muted">
            New headshot ready — approve before regenerating {sheetCount || "existing"} sheet
            angle{sheetCount === 1 ? "" : "s"} (bindings preserved).
          </p>
          <button
            type="button"
            disabled={pending || sheetCount === 0}
            onClick={() =>
              run(() => approveFalSafeRestyleSheetsAction(seriesId, character.id))
            }
            className="studio-btn studio-btn-secondary !min-h-7 !px-2 !text-[11px]"
          >
            Approve &amp; regenerate sheets
          </button>
          <CreditCostHint
            cost={estimateSheetCredits() * Math.max(1, sheetCount)}
            available={null}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelFalSafeRestyleAction(seriesId, character.id))}
            className="studio-btn studio-btn-ghost !min-h-7 !px-2 !text-[11px]"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {showDraftTests && segments.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">
            Run draft test on a bound segment to verify Seedance accepts the restyled refs:
          </p>
          <ul className="space-y-1">
            {segments.slice(0, 4).map((segment) => (
              <li key={`${segment.sceneId}-${segment.sheetId}`} className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      runFalSafeDraftTestAction({
                        seriesId,
                        characterId: character.id,
                        sceneId: segment.sceneId,
                        episodeId: segment.episodeId,
                      }),
                    )
                  }
                  className="studio-btn studio-btn-ghost !min-h-7 !px-2 !text-[11px]"
                >
                  Run draft test
                </button>
                <Link
                  href={`/series/${seriesId}/episodes/${segment.episodeId}`}
                  className="text-[11px] text-accent hover:underline"
                >
                  {segment.episodeTitle} · {segment.sceneTitle}
                </Link>
                <span className="text-[10px] text-muted">({segment.sheetName})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-xs text-accent">{error}</p> : null}
      {note ? <p className="text-xs text-muted">{note}</p> : null}
    </div>
  );
}
