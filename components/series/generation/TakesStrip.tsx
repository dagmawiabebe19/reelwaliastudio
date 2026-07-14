"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Sparkles, Star } from "lucide-react";
import {
  starTakeAction,
  clearFailedTakesAction,
  reconcileTakeAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import {
  deleteTakeAction,
  getTakeDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { VideoTakePlayer } from "@/components/series/generation/VideoTakePlayer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GeneratingPulse, SkeletonThumbnail } from "@/components/ui/Skeleton";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { ICON_MD, ICON_SM, ICON_STROKE } from "@/components/ui/icon";
import { Lightbox, LightboxImageButton, useLightbox, type LightboxImage } from "@/components/ui/Lightbox";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { Orientation } from "@/lib/db/types";
import { getLikenessRejectionDisplay } from "@/lib/ai/video/seedance-likeness";
import { regenerateLikenessSafeReferencesAction } from "@/app/(app)/series/[id]/production-actions";
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

function StarToggleButton({
  starred,
  disabled,
  onClick,
  size = "md",
}: {
  starred: boolean;
  disabled?: boolean;
  onClick: () => void;
  size?: "sm" | "md";
}) {
  const iconClass = size === "sm" ? ICON_SM : ICON_MD;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`focus-ring studio-icon-btn !border-transparent !bg-transparent ${
        starred ? "!text-amber-400" : ""
      }`}
      aria-label={starred ? "Unstar take" : "Star take"}
    >
      <Star
        className={`${iconClass} ${starred ? "fill-amber-400" : ""}`}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
    </button>
  );
}

function TakeThumbMedia({ take }: { take: TakeCardData }) {
  if (take.status === "pending") {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-background">
        <SkeletonThumbnail className="absolute inset-0 opacity-40" />
        <GeneratingPulse />
      </div>
    );
  }

  if (!take.assetUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <SkeletonThumbnail className="h-full w-full opacity-30" />
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
            className="studio-icon-btn absolute bottom-0.5 right-0.5 z-10 !min-h-5 !min-w-5 opacity-0 group-hover/strip:opacity-100"
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
            <Maximize2 className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
          </span>
        ) : null}
      </div>
      {take.starred ? (
        <span className="absolute left-1 top-1 text-amber-400" aria-hidden>
          <Star className={`${ICON_SM} fill-amber-400`} strokeWidth={ICON_STROKE} />
        </span>
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

  function handleReconcileTake(takeId: string) {
    startTransition(async () => {
      const result = await reconcileTakeAction(takeId, episodeId, seriesId);
      if ("error" in result && result.error) {
        alert(result.error);
        return;
      }
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
        <EmptyState
          variant="inline"
          icon={Star}
          title="No takes yet"
          description="Set quality in the output panel and hit generate, or ask the co-pilot for help."
        />
      </div>
    );
  }

  if (takes.length === 0 && layout === "preview") {
    return (
      <EmptyState
        variant="preview"
        icon={Sparkles}
        title="Ready to generate"
        description="Bind references, tune your shot, then hit Generate — or ask the co-pilot to refine the prompt."
        className={previewFrameClass}
      />
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
              <StarToggleButton
                starred={activeTake.starred}
                disabled={pending}
                onClick={() => toggleStar(activeTake.id, activeTake.starred)}
              />
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
                <>
                  <span className="text-xs text-status-progress">Generating…</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-2 py-1 text-[10px] text-muted hover:text-accent"
                    disabled={pending}
                    onClick={() => handleReconcileTake(activeTake.id)}
                  >
                    Check status
                  </Button>
                </>
              ) : activeTake.status === "failed" ? (
                <span className="max-w-md truncate text-xs text-muted" title={activeTake.error_message ?? undefined}>
                  {getLikenessRejectionDisplay(activeTake.error_message).isLikeness
                    ? "Rejected: reference flagged as real-person likeness"
                    : (activeTake.error_message ?? "Failed")}
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
              <p className="studio-section-label inline-flex items-center gap-1.5">
                Take {activeTake.take_number}
                {activeTake.starred ? (
                  <Star className={`${ICON_SM} fill-amber-400 text-amber-400`} strokeWidth={ICON_STROKE} aria-hidden />
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                <StarToggleButton
                  starred={activeTake.starred}
                  disabled={pending}
                  onClick={() => toggleStar(activeTake.id, activeTake.starred)}
                  size="sm"
                />
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
            ) : activeTake.status === "pending" ? (
              <div className="flex h-full min-h-[12rem] items-center justify-center bg-background">
                <GeneratingPulse label="Generating…" />
              </div>
            ) : activeTake.status === "failed" ? (
              (() => {
                const likeness = getLikenessRejectionDisplay(activeTake.error_message);
                return (
                  <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
                    <p className="text-sm font-medium text-foreground">{likeness.headline}</p>
                    {likeness.detail ? (
                      <p className="text-xs leading-relaxed text-muted">{likeness.detail}</p>
                    ) : (
                      <p className="text-xs leading-relaxed text-muted">
                        Something went wrong. Try generating again or check status.
                      </p>
                    )}
                    {likeness.isLikeness ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-auto px-3 py-1.5 text-[11px]"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await regenerateLikenessSafeReferencesAction(
                                seriesId,
                                likeness.references,
                              );
                              if ("error" in result && result.error) {
                                alert(result.error);
                                return;
                              }
                              router.refresh();
                            });
                          }}
                        >
                          Regenerate flagged refs (fal-safe)
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto px-3 py-1.5 text-[11px]"
                          onClick={() => {
                            window.open(`/series/${seriesId}`, "_blank", "noopener,noreferrer");
                          }}
                        >
                          Open series restyle
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : (
              <EmptyState
                variant="preview"
                icon={Sparkles}
                title="Ready to generate"
                description="Hit Generate below when your shot is set."
                className="h-full min-h-[12rem] border-0 rounded-none"
              />
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
