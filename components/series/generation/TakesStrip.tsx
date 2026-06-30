"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  starTakeAction,
  clearFailedTakesAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import {
  deleteTakeAction,
  getTakeDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { VideoTakePlayer } from "@/components/series/generation/VideoTakePlayer";
import { Button } from "@/components/ui/Button";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { Lightbox, LightboxImageButton, useLightbox, type LightboxImage } from "@/components/ui/Lightbox";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { Orientation } from "@/lib/db/types";
import {
  orientationAspectClass,
  takeStatusRingClass,
} from "@/lib/storyboard/studio-visuals";

export type TakeCardData = {
  id: string;
  take_number: number;
  media_type: "image" | "video";
  starred: boolean;
  status: string;
  error_message: string | null;
  assetUrl: string | null;
  model: string | null;
  has_audio?: boolean;
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

function TakeThumbMedia({ take }: { take: TakeCardData }) {
  if (take.status === "pending") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-progress" />
      </div>
    );
  }

  if (!take.assetUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background text-[9px] text-muted">
        —
      </div>
    );
  }

  if (take.media_type === "video") {
    return (
      <video
        src={take.assetUrl}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={take.assetUrl} alt="" className="h-full w-full object-cover" />
  );
}

function ContactSheetThumb({
  take,
  active,
  orientation,
  onSelect,
  imageGallery,
  galleryIndex,
  onOpenGallery,
}: {
  take: TakeCardData;
  active: boolean;
  orientation: Orientation;
  onSelect: () => void;
  imageGallery: LightboxImage[];
  galleryIndex: number;
  onOpenGallery: ReturnType<typeof useLightbox>["openGallery"];
}) {
  const thumbWidth = orientation === "portrait" ? "w-[3.25rem]" : "w-[5rem]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`studio-contact-thumb ${thumbWidth} ${takeStatusRingClass(take.status, active)}`}
      aria-label={`Take ${take.take_number}`}
    >
      <div className={`${orientationAspectClass(orientation)} relative w-full`}>
        <TakeThumbMedia take={take} />
        {take.media_type === "image" && take.assetUrl ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`View take ${take.take_number} larger`}
            className="absolute bottom-0.5 right-0.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-background/90 text-[10px] text-foreground opacity-0 ring-1 ring-border/60 transition-opacity hover:ring-accent/50 group-hover/strip:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onOpenGallery(imageGallery, galleryIndex, e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onOpenGallery(imageGallery, galleryIndex, e.currentTarget);
              }
            }}
          >
            ⤢
          </span>
        ) : null}
      </div>
      {take.starred ? (
        <span className="absolute left-1 top-1 text-[10px] text-amber-400">★</span>
      ) : null}
      {take.status === "failed" ? (
        <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />
      ) : null}
      <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[9px] text-muted">
        {take.take_number}
      </span>
    </div>
  );
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
  const lightbox = useLightbox();

  const imageTakeGallery = useMemo(
    () =>
      takes
        .filter((take) => take.media_type === "image" && take.assetUrl)
        .map((take) => ({
          src: take.assetUrl!,
          alt: `${sceneTitle} take ${take.take_number}`,
          caption: `Take ${take.take_number}`,
        })),
    [sceneTitle, takes],
  );

  const imageTakeGalleryIndex = useMemo(() => {
    const map = new Map(
      takes
        .filter((take) => take.media_type === "image" && take.assetUrl)
        .map((take, index) => [take.id, index]),
    );
    return map;
  }, [takes]);

  const activeIndex = controlledIndex ?? internalIndex;
  const setActiveIndex = onActiveIndexChange ?? setInternalIndex;

  const activeTake = takes[activeIndex] ?? null;
  const isPortrait = orientation === "portrait";
  const hasPending = takes.some((t) => t.status === "pending");
  const failedCount = takes.filter((t) => t.status === "failed").length;
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

  function handleClearFailed() {
    if (failedCount < 1) return;
    const confirmed = window.confirm(
      `Remove ${failedCount} failed take${failedCount === 1 ? "" : "s"} from this scene? Ready and pending takes are not affected.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await clearFailedTakesAction(sceneId, seriesId, episodeId);
      if ("error" in result && result.error) {
        alert(result.error);
        return;
      }
      setActiveIndex(0);
      router.refresh();
    });
  }

  const showStrip = layout === "combined" || layout === "strip";
  const showPreview = layout === "combined" || layout === "preview";
  const isOutputPreview = layout === "preview";

  const previewFrameClass = isOutputPreview
    ? isPortrait
      ? "mx-auto aspect-[9/16] max-h-[min(72vh,42rem)] w-full max-w-[min(100%,22rem)]"
      : "mx-auto aspect-video w-full max-w-full"
    : isPortrait
      ? "aspect-[9/16] w-full max-w-[min(100%,280px)]"
      : "aspect-video w-full";

  if (takes.length === 0 && layout !== "preview") {
    return (
      <div className="space-y-3">
        {showStrip ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="studio-section-label">Takes</p>
            <a
              href={`/api/export/scene/${sceneId}`}
              className="text-[10px] tracking-wide text-accent hover:underline"
            >
              Export starred
            </a>
          </div>
        ) : null}
        <p className="text-sm text-muted">No takes yet — generate in the output panel.</p>
      </div>
    );
  }

  if (takes.length === 0 && layout === "preview") {
    return (
      <div className={`studio-empty-preview ${previewFrameClass}`}>
        <p className="font-display text-xs tracking-widest text-muted">Output</p>
        <p className="text-sm">Ready to generate</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${isOutputPreview ? "min-w-0 max-w-full" : ""}`}>
      {showStrip ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="studio-section-label">Contact sheet</p>
            <div className="flex flex-wrap items-center gap-3">
              {failedCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto px-2 py-1 text-[10px] text-muted hover:text-accent"
                  disabled={pending}
                  onClick={handleClearFailed}
                >
                  Clear failed ({failedCount})
                </Button>
              ) : null}
              <a
                href={`/api/export/scene/${sceneId}`}
                className="text-[10px] tracking-wide text-accent hover:underline"
              >
                Export starred
              </a>
            </div>
          </div>

          <div className="studio-contact-scroll group/strip">
            {takes.map((take, index) => (
              <ContactSheetThumb
                key={take.id}
                take={take}
                active={activeIndex === index}
                orientation={orientation}
                onSelect={() => setActiveIndex(index)}
                imageGallery={imageTakeGallery}
                galleryIndex={imageTakeGalleryIndex.get(take.id) ?? 0}
                onOpenGallery={lightbox.openGallery}
              />
            ))}
          </div>

          {activeTake && layout === "strip" ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => toggleStar(activeTake.id, activeTake.starred)}
                className={`text-lg ${activeTake.starred ? "text-amber-400" : "text-muted"}`}
                aria-label={activeTake.starred ? "Unstar take" : "Star take"}
              >
                {activeTake.starred ? "★" : "☆"}
              </button>
              <span className="text-xs text-muted">{activeTake.model ?? "—"}</span>
              <DeleteConfirmButton
                ariaLabel="Delete take"
                fetchPreview={() =>
                  getTakeDeletePreviewAction(activeTake.id, episodeId, seriesId)
                }
                onDelete={() => deleteTakeAction(activeTake.id, episodeId, seriesId)}
                onSuccess={() => router.refresh()}
              />
              {activeTake.status === "pending" ? (
                <span className="text-xs text-status-progress">Generating…</span>
              ) : activeTake.status === "failed" ? (
                <span className="max-w-md truncate text-xs text-muted" title={activeTake.error_message ?? undefined}>
                  {activeTake.error_message ?? "Failed"}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {showPreview && activeTake ? (
        <div className={isOutputPreview ? "min-w-0 max-w-full space-y-4" : "grid gap-4 md:grid-cols-[1fr_auto]"}>
          {isOutputPreview ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="studio-section-label">
                Take {activeTake.take_number}
                {activeTake.starred ? <span className="ml-2 text-amber-400">★</span> : null}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleStar(activeTake.id, activeTake.starred)}
                  className={`text-base ${activeTake.starred ? "text-amber-400" : "text-muted"}`}
                  aria-label={activeTake.starred ? "Unstar take" : "Star take"}
                >
                  {activeTake.starred ? "★" : "☆"}
                </button>
                {failedCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-2 py-1 text-[10px] text-muted"
                    disabled={pending}
                    onClick={handleClearFailed}
                  >
                    Clear failed ({failedCount})
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className={`overflow-hidden rounded-lg border border-border/80 bg-background ${previewFrameClass}`}
          >
            {activeTake.assetUrl ? (
              activeTake.media_type === "video" ? (
                <VideoTakePlayer
                  src={activeTake.assetUrl}
                  isPortrait={isPortrait}
                  fullWidth
                  hasAudio={Boolean(activeTake.has_audio)}
                />
              ) : (
                <LightboxImageButton
                  src={activeTake.assetUrl}
                  alt={`${sceneTitle} take ${activeTake.take_number}`}
                  caption={`Take ${activeTake.take_number}`}
                  gallery={imageTakeGallery}
                  galleryIndex={imageTakeGalleryIndex.get(activeTake.id) ?? 0}
                  onOpenGallery={lightbox.openGallery}
                  className="h-full w-full"
                  imageClassName="h-full w-full object-contain"
                />
              )
            ) : (
              <div className="studio-empty-preview h-full min-h-[12rem] border-0">
                {activeTake.status === "pending" ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-status-progress" />
                    <p className="text-sm">Generating…</p>
                  </>
                ) : (
                  <p className="text-sm">Ready to generate</p>
                )}
              </div>
            )}
          </div>

          {activeTake.status === "failed" && activeTake.error_message && activeTake.assetUrl ? (
            <p className="text-center text-xs leading-relaxed text-muted">{activeTake.error_message}</p>
          ) : null}
        </div>
      ) : null}
      <Lightbox state={lightbox.state} onClose={lightbox.close} />
    </div>
  );
}
