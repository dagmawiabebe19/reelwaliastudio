"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { starTakeAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import {
  deleteTakeAction,
  getTakeDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { VideoTakePlayer } from "@/components/series/generation/VideoTakePlayer";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { Orientation } from "@/lib/db/types";

export type TakeCardData = {
  id: string;
  take_number: number;
  media_type: "image" | "video";
  starred: boolean;
  status: string;
  error_message: string | null;
  assetUrl: string | null;
  model: string | null;
};

type TakesStripLayout = "combined" | "strip" | "preview";

interface TakesStripProps {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  sceneTitle: string;
  orientation: Orientation;
  takes: TakeCardData[];
  layout?: TakesStripLayout;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}

function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "ready":
      return "Done";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending":
      return "text-amber-400";
    case "failed":
      return "text-accent";
    case "ready":
      return "text-emerald-400";
    default:
      return "text-muted";
  }
}

export function TakesStrip({
  sceneId,
  seriesId,
  episodeId,
  sceneTitle,
  orientation,
  takes,
  layout = "combined",
  activeIndex: controlledIndex,
  onActiveIndexChange,
}: TakesStripProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [internalIndex, setInternalIndex] = useState(0);

  const activeIndex = controlledIndex ?? internalIndex;
  const setActiveIndex = onActiveIndexChange ?? setInternalIndex;

  const activeTake = takes[activeIndex] ?? null;
  const isPortrait = orientation === "portrait";
  const hasPending = takes.some((t) => t.status === "pending");
  usePollWhilePending(hasPending);

  useEffect(() => {
    if (controlledIndex === undefined) {
      setInternalIndex(0);
    }
  }, [sceneId, takes.length, controlledIndex]);

  function toggleStar(takeId: string, starred: boolean) {
    startTransition(async () => {
      await starTakeAction(takeId, !starred, seriesId, episodeId);
      router.refresh();
    });
  }

  const showStrip = layout === "combined" || layout === "strip";
  const showPreview = layout === "combined" || layout === "preview";
  const isOutputPreview = layout === "preview";

  const previewFrameClass = isOutputPreview
    ? activeTake?.media_type === "video"
      ? "w-full"
      : isPortrait
        ? "aspect-[9/16] w-full"
        : "aspect-video w-full"
    : activeTake?.media_type === "video"
      ? isPortrait
        ? "w-full max-w-[min(100%,280px)]"
        : "w-full"
      : isPortrait
        ? "aspect-[9/16] w-full max-w-[min(100%,280px)]"
        : "aspect-video w-full";

  if (takes.length === 0 && layout !== "preview") {
    return (
      <div className="space-y-2">
        {showStrip ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="studio-column-heading-sm font-display text-foreground">Takes</h3>
            <a
              href={`/api/export/scene/${sceneId}`}
              className="text-xs text-accent hover:underline"
            >
              Download starred takes
            </a>
          </div>
        ) : null}
        <p className="text-sm text-muted">No takes yet. Generate one in the output panel.</p>
      </div>
    );
  }

  if (takes.length === 0 && layout === "preview") {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm text-muted ${previewFrameClass}`}
      >
        No take selected
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${isOutputPreview ? "min-w-0 max-w-full" : ""}`}>
      {showStrip ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="studio-column-heading-sm font-display text-foreground">Takes</h3>
            <a
              href={`/api/export/scene/${sceneId}`}
              className="text-xs text-accent hover:underline"
            >
              Download starred takes
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            {takes.map((take, index) => (
              <button
                key={take.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  activeIndex === index
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-muted hover:text-accent"
                }`}
              >
                Take {take.take_number}
                {take.status === "pending" ? (
                  <span className="ml-2 text-amber-400">…</span>
                ) : take.status === "ready" ? (
                  <span className="ml-2 text-emerald-400">✓</span>
                ) : take.status === "failed" ? (
                  <span className="ml-2 text-accent">✗</span>
                ) : (
                  <span className={`ml-2 ${statusColor(take.status)}`}>
                    {statusLabel(take.status)}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTake && layout === "strip" ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => toggleStar(activeTake.id, activeTake.starred)}
                className={`text-lg ${activeTake.starred ? "text-amber-400" : "text-muted"}`}
                aria-label={activeTake.starred ? "Unstar take" : "Star take"}
              >
                {activeTake.starred ? "★" : "☆"}
              </button>
              <span className="text-sm text-muted">{activeTake.model ?? "—"}</span>
              <DeleteConfirmButton
                ariaLabel="Delete take"
                fetchPreview={() =>
                  getTakeDeletePreviewAction(activeTake.id, episodeId, seriesId)
                }
                onDelete={() => deleteTakeAction(activeTake.id, episodeId, seriesId)}
                onSuccess={() => router.refresh()}
              />
              <GenerationStatusLine
                status={activeTake.status}
                error={activeTake.error_message}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {showPreview && activeTake ? (
        <div
          className={
            layout === "combined"
              ? "grid gap-4 md:grid-cols-[1fr_auto]"
              : "min-w-0 max-w-full space-y-3"
          }
        >
          {layout === "combined" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleStar(activeTake.id, activeTake.starred)}
                  className={`text-lg ${activeTake.starred ? "text-amber-400" : "text-muted"}`}
                  aria-label={activeTake.starred ? "Unstar take" : "Star take"}
                >
                  {activeTake.starred ? "★" : "☆"}
                </button>
                <span className="text-sm text-muted">{activeTake.model ?? "—"}</span>
                <DeleteConfirmButton
                  ariaLabel="Delete take"
                  fetchPreview={() =>
                    getTakeDeletePreviewAction(activeTake.id, episodeId, seriesId)
                  }
                  onDelete={() => deleteTakeAction(activeTake.id, episodeId, seriesId)}
                  onSuccess={() => router.refresh()}
                />
              </div>

              <GenerationStatusLine
                status={activeTake.status}
                error={activeTake.error_message}
              />

              {activeTake.status === "failed" && activeTake.error_message ? (
                <p className="studio-contained-error rounded-md border border-accent/30 bg-accent-muted/20 px-3 py-2 text-sm text-accent">
                  {activeTake.error_message}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-sm text-muted">
                Take {activeTake.take_number}
                {activeTake.starred ? <span className="ml-2 text-amber-400">★</span> : null}
              </p>
              <div className="min-w-0 shrink">
                <GenerationStatusLine
                  status={activeTake.status}
                  error={
                    activeTake.status === "failed" ? null : activeTake.error_message
                  }
                />
              </div>
            </div>
          )}

          <div
            className={`mx-auto w-full max-w-full overflow-hidden rounded-lg border border-border bg-background ${previewFrameClass}`}
          >
            {activeTake.assetUrl ? (
              activeTake.media_type === "video" ? (
                <VideoTakePlayer
                  src={activeTake.assetUrl}
                  isPortrait={isPortrait}
                  fullWidth
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeTake.assetUrl}
                  alt={`${sceneTitle} take ${activeTake.take_number}`}
                  className={`h-full w-full ${
                    isOutputPreview ? "object-cover" : "object-contain"
                  }`}
                />
              )
            ) : (
              <div
                className={`flex w-full items-center justify-center text-xs text-muted ${
                  isOutputPreview ? "h-full min-h-0" : "min-h-[12rem]"
                }`}
              >
                {activeTake.status === "pending" ? "Generating…" : "No preview"}
              </div>
            )}
          </div>

          {layout === "preview" && activeTake.status === "failed" && activeTake.error_message ? (
            <p className="studio-contained-error rounded-md border border-accent/30 bg-accent-muted/20 px-3 py-2 text-sm text-accent">
              {activeTake.error_message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
