"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveSceneAction,
  createSceneAction,
  reorderScenesAction,
  unarchiveSceneAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import {
  deleteSceneAction,
  getSceneDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { Button } from "@/components/ui/Button";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { Lightbox, LightboxImageButton, useLightbox } from "@/components/ui/Lightbox";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import type { Episode, Orientation } from "@/lib/db/types";
import {
  countReadyTakes,
  orientationAspectClass,
  resolveRepresentativeTake,
  sceneHasPendingVideoTake,
} from "@/lib/storyboard/studio-visuals";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import {
  ARCHIVE_BUCKET_ID,
  STORYBOARD_ONLY_BUCKET_ID,
  STORYBOARD_ONLY_LABEL,
  buildEpisodeBuckets,
  clearHighlightSegments,
  computeEpisodeOrderAfterBucketReorder,
  episodeBucketLabel,
  readHighlightSegments,
  scenesForBucket,
  type SegmentBucket,
} from "@/lib/storyboard/episode-buckets";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

const ARCHIVE_DROP_ID = "__archive_drop__";
const STRIP_END_DROP_ID = "__strip_end__";
const SCENE_DRAG_MIME = "application/x-reelwalia-scene-id";

interface SceneRailProps {
  seriesId: string;
  episodeId: string;
  episodes: Episode[];
  defaultOrientation: Orientation;
  scenes: SceneWithBindings[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  takesByScene?: Record<string, TakeCardData[]>;
}

function SegmentThumbnail({
  url,
  mediaType,
  title,
}: {
  url: string | null;
  mediaType: "image" | "video" | null;
  title: string;
}) {
  const lightbox = useLightbox();

  if (!url) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-background px-2 text-center">
        <span className="font-display text-[9px] tracking-widest text-muted">Ready</span>
        <span className="line-clamp-2 text-[10px] leading-tight text-foreground/80">{title}</span>
      </div>
    );
  }

  if (mediaType === "video") {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <>
      <LightboxImageButton
        src={url}
        alt={title}
        caption={title}
        onOpenGallery={lightbox.openGallery}
        className="h-full w-full"
      />
      <Lightbox state={lightbox.state} onClose={lightbox.close} />
    </>
  );
}

function SegmentCard({
  scene,
  sceneNumber,
  orientation,
  takes,
  seriesId,
  isSelected,
  isHighlighted,
  isGenerating,
  isArchivedView,
  isDragging,
  isDropTarget,
  menuOpen,
  onToggleMenu,
  onSelect,
  onArchive,
  onRestore,
  onDeleted,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
  cardRef,
}: {
  scene: SceneWithBindings;
  sceneNumber: number;
  orientation: Orientation;
  takes: TakeCardData[];
  seriesId: string;
  isSelected: boolean;
  isHighlighted: boolean;
  isGenerating: boolean;
  isArchivedView: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDeleted: () => void;
  onDragStart: (sceneId: string, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onCardDragOver: (sceneId: string, event: React.DragEvent<HTMLElement>) => void;
  onCardDrop: (sceneId: string, event: React.DragEvent<HTMLElement>) => void;
  cardRef?: (node: HTMLElement | null) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const representative = resolveRepresentativeTake(takes);
  const readyCount = countReadyTakes(takes);
  const isUngenerated = readyCount === 0 && !isGenerating;
  const thumbWidth = orientation === "portrait" ? "w-[4.5rem]" : "w-[6.5rem]";

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onToggleMenu();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, onToggleMenu]);

  return (
    <article
      ref={cardRef}
      onClick={onSelect}
      onDragOver={(event) => onCardDragOver(scene.id, event)}
      onDrop={(event) => onCardDrop(scene.id, event)}
      className={`studio-segment-card group w-[7.5rem] ${isSelected ? "studio-segment-card--active" : ""} ${
        isHighlighted ? "studio-segment-card--new" : ""
      } ${isUngenerated ? "studio-segment-card--ungenerated" : ""} ${
        isDragging ? "studio-segment-card--dragging" : ""
      } ${isDropTarget ? "studio-segment-card--drop-target" : ""}`}
    >
      <div className={`relative mx-auto mt-2 ${thumbWidth} overflow-hidden rounded-sm border border-border/80 bg-background`}>
        <div className={`${orientationAspectClass(orientation)} w-full`}>
          {isGenerating ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-background">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-progress" />
              <span className="text-[9px] text-status-progress">Generating…</span>
            </div>
          ) : (
            <SegmentThumbnail
              url={representative?.assetUrl ?? null}
              mediaType={representative?.media_type ?? null}
              title={scene.title}
            />
          )}
        </div>
        <span
          className={`absolute right-1 top-1 rounded px-1 py-px text-[9px] font-medium ${
            readyCount === 0
              ? "bg-background/90 text-muted"
              : "bg-background/90 text-foreground"
          }`}
        >
          {readyCount}
        </span>
        {!isArchivedView ? (
          <div className="absolute left-0.5 top-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <span
              draggable
              onDragStart={(event) => onDragStart(scene.id, event)}
              onDragEnd={onDragEnd}
              onClick={(event) => event.stopPropagation()}
              className="studio-segment-drag-handle flex h-5 w-5 items-center justify-center rounded bg-background/90 text-[10px] text-muted ring-1 ring-border/60"
              aria-label={`Drag segment ${sceneNumber}`}
              title="Drag to reorder or drop on Archive"
            >
              ⠿
            </span>
            <DeleteConfirmButton
              ariaLabel={`Delete segment ${scene.title}`}
              className="!h-5 !w-5 !rounded !bg-background/90 !text-[11px] !ring-1 !ring-border/60 opacity-100"
              fetchPreview={() =>
                getSceneDeletePreviewAction(scene.id, scene.episode_id, seriesId)
              }
              onDelete={() => deleteSceneAction(scene.id, seriesId)}
              onSuccess={onDeleted}
            />
          </div>
        ) : null}
      </div>

      <div className="relative px-2 pb-2 pt-1.5">
        <p className="truncate font-mono text-[10px] text-muted">
          {String(sceneNumber).padStart(2, "0")}
          {scene.duration_seconds ? ` · ${scene.duration_seconds}s` : ""}
        </p>
        <p className="line-clamp-2 text-[11px] leading-snug text-foreground">{scene.title}</p>

        <div className="absolute right-1 top-0" ref={menuRef}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu();
            }}
            className="rounded px-1 py-0.5 text-xs text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
            aria-label="Segment actions"
          >
            …
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[8.5rem] rounded-md border border-border bg-surface-elevated py-1 shadow-lg">
              {isArchivedView ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent-muted/30"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRestore();
                  }}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent-muted/30"
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchive();
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function SceneRail({
  seriesId,
  episodeId,
  episodes,
  defaultOrientation,
  scenes,
  selectedSceneId,
  onSelectScene,
  takesByScene = {},
}: SceneRailProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [showArchive, setShowArchive] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [archiveDropActive, setArchiveDropActive] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeBucketId, setActiveBucketId] = useState<string>(episodeId);
  const [highlightSceneIds, setHighlightSceneIds] = useState<string[]>([]);
  const [addToStoryboardOnly, setAddToStoryboardOnly] = useState(false);

  const episodeBuckets = useMemo(() => buildEpisodeBuckets(episodes), [episodes]);
  const storyboardBucket: SegmentBucket = {
    id: STORYBOARD_ONLY_BUCKET_ID,
    type: "storyboard-only",
    label: STORYBOARD_ONLY_LABEL,
  };
  const archiveBucket: SegmentBucket = {
    id: ARCHIVE_BUCKET_ID,
    type: "archive",
    label: "Archive",
  };

  useEffect(() => {
    if (!showArchive) {
      setActiveBucketId(episodeId);
    }
  }, [episodeId, showArchive]);

  const archivedScenes = scenes.filter((scene) => scene.status === "archived");

  const currentBucket: SegmentBucket = showArchive
    ? archiveBucket
    : activeBucketId === STORYBOARD_ONLY_BUCKET_ID
      ? storyboardBucket
      : episodeBuckets.find((bucket) => bucket.id === activeBucketId) ?? {
          id: episodeId,
          type: "episode",
          episodeId,
          label:
            episodeBucketLabel(
              episodes.find((episode) => episode.id === episodeId)?.sort_order ?? 0,
            ),
        };

  const bucketScenes = scenesForBucket(scenes, currentBucket);

  const autoScrollStrip = (clientX: number) => {
    const container = scrollRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const edge = 56;
    let delta = 0;
    if (clientX < rect.left + edge) {
      delta = -Math.ceil((rect.left + edge - clientX) / 6);
    } else if (clientX > rect.right - edge) {
      delta = Math.ceil((clientX - (rect.right - edge)) / 6);
    }

    if (delta !== 0) {
      container.scrollLeft += delta;
    }
  };

  function scrollToScene(sceneId: string) {
    const node = cardRefs.current.get(sceneId);
    const container = scrollRef.current;
    if (!node || !container) return;
    const nodeLeft = node.offsetLeft;
    const nodeRight = nodeLeft + node.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (nodeLeft < viewLeft || nodeRight > viewRight) {
      container.scrollTo({
        left: Math.max(0, nodeLeft - container.clientWidth / 2 + node.offsetWidth / 2),
        behavior: "smooth",
      });
    }
  }

  function scrollToEnd() {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
  }

  useEffect(() => {
    const payload = readHighlightSegments();
    if (!payload?.sceneIds.length) return;

    const targetEpisodeId = payload.episodeId ?? episodeId;
    const firstScene = scenes.find((scene) => payload.sceneIds.includes(scene.id));

    if (firstScene) {
      if (firstScene.status === "archived") {
        setShowArchive(true);
      } else if (
        (firstScene.act_label ?? STORYBOARD_ONLY_LABEL) === STORYBOARD_ONLY_LABEL
      ) {
        setShowArchive(false);
        setActiveBucketId(STORYBOARD_ONLY_BUCKET_ID);
      } else {
        setShowArchive(false);
        setActiveBucketId(firstScene.episode_id);
      }
    } else {
      setShowArchive(false);
      setActiveBucketId(targetEpisodeId);
    }

    setHighlightSceneIds(payload.sceneIds);
    onSelectScene(payload.sceneIds[payload.sceneIds.length - 1] ?? selectedSceneId ?? "");

    const lastSceneId = payload.sceneIds[payload.sceneIds.length - 1];
    window.setTimeout(() => {
      if (lastSceneId) scrollToScene(lastSceneId);
      else scrollToEnd();
    }, 80);

    const clearTimer = window.setTimeout(() => {
      setHighlightSceneIds([]);
      clearHighlightSegments();
    }, 2800);

    return () => window.clearTimeout(clearTimer);
  }, [scenes, episodeId, onSelectScene, selectedSceneId]);

  useEffect(() => {
    if (!highlightSceneIds.length) return;
    const lastSceneId = highlightSceneIds[highlightSceneIds.length - 1];
    window.setTimeout(() => scrollToScene(lastSceneId), 50);
  }, [activeBucketId, showArchive, highlightSceneIds, bucketScenes.length]);

  function handleCreate(formData: FormData) {
    if (addToStoryboardOnly) {
      formData.set("actLabel", STORYBOARD_ONLY_LABEL);
    }

    startTransition(async () => {
      const targetEpisodeId =
        showArchive || addToStoryboardOnly
          ? episodeId
          : currentBucket.type === "episode"
            ? currentBucket.episodeId
            : episodeId;

      const result = await createSceneAction(targetEpisodeId, seriesId, formData);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  function clearDragState() {
    setDragId(null);
    setDropBeforeId(null);
    setArchiveDropActive(false);
  }

  function readDraggedSceneId(event: React.DragEvent): string | null {
    const fromMime = event.dataTransfer.getData(SCENE_DRAG_MIME);
    if (fromMime) return fromMime;
    const plain = event.dataTransfer.getData("text/plain");
    return plain || dragId;
  }

  function persistBucketOrder(orderedBucketIds: string[]) {
    const targetEpisodeId =
      currentBucket.type === "episode" ? currentBucket.episodeId : episodeId;
    const episodeOrder = computeEpisodeOrderAfterBucketReorder(
      scenes,
      currentBucket,
      orderedBucketIds,
      episodeId,
    );

    startTransition(async () => {
      const result = await reorderScenesAction(targetEpisodeId, seriesId, episodeOrder);
      if (result.error) alert(result.error);
      router.refresh();
    });
  }

  function reorderWithinBucket(draggedId: string, insertBeforeId: string) {
    const ids = bucketScenes.map((scene) => scene.id);
    const fromIndex = ids.indexOf(draggedId);
    if (fromIndex < 0) return;

    ids.splice(fromIndex, 1);
    if (insertBeforeId === STRIP_END_DROP_ID) {
      ids.push(draggedId);
    } else {
      const toIndex = ids.indexOf(insertBeforeId);
      if (toIndex < 0) ids.push(draggedId);
      else ids.splice(toIndex, 0, draggedId);
    }

    persistBucketOrder(ids);
  }

  function handleDragStart(sceneId: string, event: React.DragEvent<HTMLElement>) {
    event.dataTransfer.setData(SCENE_DRAG_MIME, sceneId);
    event.dataTransfer.setData("text/plain", sceneId);
    event.dataTransfer.effectAllowed = "move";
    setDragId(sceneId);
    setOpenMenuId(null);
  }

  function handleStripDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!dragId || showArchive) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    autoScrollStrip(event.clientX);
  }

  function handleCardDragOver(sceneId: string, event: React.DragEvent<HTMLElement>) {
    if (!dragId || showArchive || dragId === sceneId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    autoScrollStrip(event.clientX);

    const target = event.currentTarget.getBoundingClientRect();
    if (event.clientX < target.left + target.width / 2) {
      setDropBeforeId(sceneId);
    } else {
      const index = bucketScenes.findIndex((scene) => scene.id === sceneId);
      const nextScene = index >= 0 ? bucketScenes[index + 1] : null;
      setDropBeforeId(nextScene?.id ?? STRIP_END_DROP_ID);
    }
  }

  function handleCardDrop(sceneId: string, event: React.DragEvent<HTMLElement>) {
    if (showArchive) return;
    event.preventDefault();
    event.stopPropagation();

    const draggedId = readDraggedSceneId(event);
    if (!draggedId || draggedId === sceneId) {
      clearDragState();
      return;
    }

    const target = event.currentTarget.getBoundingClientRect();
    const insertBeforeId =
      event.clientX < target.left + target.width / 2
        ? sceneId
        : bucketScenes[bucketScenes.findIndex((s) => s.id === sceneId) + 1]?.id ??
          STRIP_END_DROP_ID;

    reorderWithinBucket(draggedId, insertBeforeId);
    clearDragState();
  }

  function handleStripDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!dragId || showArchive) return;
    event.preventDefault();
    const draggedId = readDraggedSceneId(event);
    if (!draggedId) {
      clearDragState();
      return;
    }
    if (dropBeforeId === STRIP_END_DROP_ID) {
      reorderWithinBucket(draggedId, STRIP_END_DROP_ID);
    }
    clearDragState();
  }

  function handleArchiveDragOver(event: React.DragEvent<HTMLButtonElement>) {
    if (!dragId || showArchive) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setArchiveDropActive(true);
  }

  function handleArchiveDrop(event: React.DragEvent<HTMLButtonElement>) {
    if (showArchive) return;
    event.preventDefault();
    const draggedId = readDraggedSceneId(event);
    const scene = scenes.find((item) => item.id === draggedId);
    clearDragState();
    if (!draggedId || !scene || scene.status === "archived") return;

    startTransition(async () => {
      const result = await archiveSceneAction(draggedId, scene.episode_id, seriesId);
      if (result.error) alert(result.error);
      if (selectedSceneId === draggedId) {
        onSelectScene("");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="studio-section-label">Segments</p>
        <div className="inline-flex rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => setShowArchive(false)}
            className={`rounded-full px-3 py-1 text-[10px] tracking-wide ${
              !showArchive ? "bg-accent-muted text-accent" : "text-muted"
            }`}
          >
            Storyboard
          </button>
          <button
            type="button"
            onClick={() => setShowArchive(true)}
            onDragOver={handleArchiveDragOver}
            onDragLeave={() => setArchiveDropActive(false)}
            onDrop={handleArchiveDrop}
            data-drop-id={ARCHIVE_DROP_ID}
            className={`studio-archive-drop-target rounded-full px-3 py-1 text-[10px] tracking-wide ${
              showArchive ? "bg-accent-muted text-accent" : "text-muted"
            } ${archiveDropActive && !showArchive ? "studio-archive-drop-target--active" : ""}`}
            title={showArchive ? undefined : "Drop a segment here to archive"}
          >
            Archive ({archivedScenes.length})
            {archiveDropActive && !showArchive ? (
              <span className="ml-1 text-[9px] normal-case">· drop to archive</span>
            ) : null}
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate(new FormData(e.currentTarget));
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          name="title"
          required
          placeholder="New segment title"
          className="min-w-[8rem] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        {!showArchive && currentBucket.type === "storyboard-only" ? (
          <input type="hidden" name="actLabel" value={STORYBOARD_ONLY_LABEL} />
        ) : !showArchive && currentBucket.type === "episode" ? (
          <input
            type="hidden"
            name="actLabel"
            value={
              episodes.find((episode) => episode.id === currentBucket.episodeId)
                ? episodeBucketLabel(
                    episodes.find((episode) => episode.id === currentBucket.episodeId)!.sort_order,
                  )
                : STORYBOARD_ONLY_LABEL
            }
          />
        ) : (
          <input type="hidden" name="actLabel" value={STORYBOARD_ONLY_LABEL} />
        )}
        <label className="flex items-center gap-1.5 text-[10px] text-muted">
          <input
            type="checkbox"
            checked={addToStoryboardOnly}
            onChange={(event) => setAddToStoryboardOnly(event.target.checked)}
            className="rounded border-border"
          />
          Storyboard-only
        </label>
        <Button type="submit" disabled={pending} className="text-sm">
          Add
        </Button>
      </form>

      {!showArchive ? (
        <div className="flex flex-wrap gap-1 border-b border-border pb-2">
          {episodeBuckets.map((bucket) => (
            <button
              key={bucket.id}
              type="button"
              onClick={() => setActiveBucketId(bucket.id)}
              className={`rounded-full px-3 py-1 text-[10px] tracking-wider ${
                activeBucketId === bucket.id
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {bucket.label.replace("_", " ")}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveBucketId(STORYBOARD_ONLY_BUCKET_ID)}
            className={`rounded-full px-3 py-1 text-[10px] tracking-wider ${
              activeBucketId === STORYBOARD_ONLY_BUCKET_ID
                ? "bg-foreground text-background"
                : "text-muted hover:text-foreground"
            }`}
          >
            Storyboard-only
          </button>
        </div>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="studio-section-label">{currentBucket.label.replace("_", " ")}</h3>
          <div className="flex items-center gap-3">
            {bucketScenes.length > 0 ? (
              <button
                type="button"
                onClick={scrollToEnd}
                className="text-[10px] tracking-wide text-muted hover:text-accent"
              >
                Newest →
              </button>
            ) : null}
          </div>
        </div>

        {bucketScenes.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">No segments in this bucket.</p>
        ) : (
          <div
            ref={scrollRef}
            className={`studio-timeline-scroll ${dragId ? "studio-timeline-scroll--dragging" : ""}`}
            onDragOver={handleStripDragOver}
            onDrop={handleStripDrop}
          >
            {bucketScenes.map((scene) => {
              const sceneTakes = takesByScene[scene.id] ?? [];
              const sceneNumber = scene.position ?? scene.sort_order + 1;
              const orientation = effectiveOrientation(scene.orientation, defaultOrientation);

              return (
                <SegmentCard
                  key={scene.id}
                  scene={scene}
                  sceneNumber={sceneNumber}
                  orientation={orientation}
                  takes={sceneTakes}
                  seriesId={seriesId}
                  isSelected={selectedSceneId === scene.id}
                  isHighlighted={highlightSceneIds.includes(scene.id)}
                  isGenerating={sceneHasPendingVideoTake(sceneTakes)}
                  isArchivedView={showArchive}
                  isDragging={dragId === scene.id}
                  isDropTarget={dropBeforeId === scene.id}
                  menuOpen={openMenuId === scene.id}
                  onToggleMenu={() =>
                    setOpenMenuId((id) => (id === scene.id ? null : scene.id))
                  }
                  onSelect={() => onSelectScene(scene.id)}
                  onArchive={() => {
                    setOpenMenuId(null);
                    startTransition(async () => {
                      await archiveSceneAction(scene.id, scene.episode_id, seriesId);
                      router.refresh();
                    });
                  }}
                  onRestore={() => {
                    setOpenMenuId(null);
                    startTransition(async () => {
                      await unarchiveSceneAction(scene.id, scene.episode_id, seriesId);
                      setShowArchive(false);
                      router.refresh();
                    });
                  }}
                  onDeleted={() => {
                    setOpenMenuId(null);
                    if (selectedSceneId === scene.id) {
                      onSelectScene("");
                    }
                    router.refresh();
                  }}
                  onDragStart={handleDragStart}
                  onDragEnd={clearDragState}
                  onCardDragOver={handleCardDragOver}
                  onCardDrop={handleCardDrop}
                  cardRef={(node) => {
                    if (node) cardRefs.current.set(scene.id, node);
                    else cardRefs.current.delete(scene.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
