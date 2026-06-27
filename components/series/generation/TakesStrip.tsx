"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { starTakeAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { VideoTakePlayer } from "@/components/series/generation/VideoTakePlayer";
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

interface TakesStripProps {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  sceneTitle: string;
  orientation: Orientation;
  takes: TakeCardData[];
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
}: TakesStripProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeIndex, setActiveIndex] = useState(0);

  const activeTake = takes[activeIndex] ?? null;
  const isPortrait = orientation === "portrait";
  const hasPending = takes.some((t) => t.status === "pending");
  usePollWhilePending(hasPending);

  function toggleStar(takeId: string, starred: boolean) {
    startTransition(async () => {
      await starTakeAction(takeId, !starred, seriesId, episodeId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg text-foreground">Takes</h3>
        <a
          href={`/api/export/scene/${sceneId}`}
          className="text-xs text-accent hover:underline"
        >
          Download starred takes
        </a>
      </div>

      {takes.length === 0 ? (
        <p className="text-sm text-muted">No takes yet. Generate one above.</p>
      ) : (
        <>
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

          {activeTake ? (
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
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
                  <span className="text-sm text-muted">
                    {activeTake.model ?? "—"}
                  </span>
                </div>

                <GenerationStatusLine
                  status={activeTake.status}
                  error={activeTake.error_message}
                />

                {activeTake.status === "failed" && activeTake.error_message ? (
                  <p className="rounded-md border border-accent/30 bg-accent-muted/20 px-3 py-2 text-sm text-accent">
                    {activeTake.error_message}
                  </p>
                ) : null}
              </div>

              <div
                className={`overflow-hidden rounded-lg border border-border bg-background ${
                  isPortrait ? "aspect-[9/16] w-48" : "aspect-video w-80"
                }`}
              >
                {activeTake.assetUrl ? (
                  activeTake.media_type === "video" ? (
                    <VideoTakePlayer src={activeTake.assetUrl} isPortrait={isPortrait} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeTake.assetUrl}
                      alt={`${sceneTitle} take ${activeTake.take_number}`}
                      className="h-full w-full object-cover"
                    />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    {activeTake.status === "pending" ? "Generating…" : "No preview"}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
