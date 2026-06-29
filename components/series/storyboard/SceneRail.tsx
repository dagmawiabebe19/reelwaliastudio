"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveSceneAction,
  createSceneAction,
  reorderScenesAction,
  unarchiveSceneAction,
  updateSceneAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import {
  deleteSceneAction,
  getSceneDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { Button } from "@/components/ui/Button";
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
  episodeBucketLabel,
  readHighlightSegments,
  scenesForBucket,
  type SegmentBucket,
} from "@/lib/storyboard/episode-buckets";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

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
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  );
}

function SegmentCard({
  scene,
  sceneNumber,
  orientation,
  takes,
  isSelected,
  isHighlighted,
  isGenerating,
  showArchive,
  menuOpen,
  onToggleMenu,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
  onDragStart,
  cardRef,
}: {
  scene: SceneWithBindings;
  sceneNumber: number;
  orientation: Orientation;
  takes: TakeCardData[];
  isSelected: boolean;
  isHighlighted: boolean;
  isGenerating: boolean;
  showArchive: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onDragStart: () => void;
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
      draggable={!showArchive}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={`studio-segment-card group w-[7.5rem] ${isSelected ? "studio-segment-card--active" : ""} ${
        isHighlighted ? "studio-segment-card--new" : ""
      } ${isUngenerated ? "studio-segment-card--ungenerated" : ""}`}
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
              {scene.status === "archived" ? (
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
                <>
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
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-accent hover:bg-accent-muted/30"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete();
                    }}
                  >
                    Delete segment
                  </button>
                </>
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

  async function handleDeleteScene(scene: SceneWithBindings) {
    setOpenMenuId(null);
    try {
      const preview = await getSceneDeletePreviewAction(scene.id, scene.episode_id, seriesId);
      if ("error" in preview && preview.error) {
        alert(preview.error);
        return;
      }
      if (!("title" in preview)) return;

      const confirmed = window.confirm(`${preview.title}\n\n${preview.message}`);
      if (!confirmed) return;

      startTransition(async () => {
        const result = await deleteSceneAction(scene.id, seriesId);
        if ("error" in result && result.error) {
          alert(result.error);
          return;
        }
        if (selectedSceneId === scene.id) {
          onSelectScene("");
        }
        router.refresh();
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  function handleDrop(targetBucket: SegmentBucket) {
    if (!dragId || targetBucket.type === "archive") return;

    const draggedScene = scenes.find((scene) => scene.id === dragId);
    if (!draggedScene) return;

    startTransition(async () => {
      if (targetBucket.type === "storyboard-only") {
        await updateSceneAction(dragId, draggedScene.episode_id, seriesId, {
          act_label: STORYBOARD_ONLY_LABEL,
        });
      } else if (targetBucket.type === "episode") {
        const episode = episodes.find((item) => item.id === targetBucket.episodeId);
        await updateSceneAction(dragId, targetBucket.episodeId, seriesId, {
          episode_id: targetBucket.episodeId,
          act_label: episode ? episodeBucketLabel(episode.sort_order) : undefined,
        });

        const targetScenes = scenesForBucket(scenes, targetBucket).filter(
          (scene) => scene.id !== dragId,
        );
        targetScenes.push({ ...draggedScene, episode_id: targetBucket.episodeId });
        await reorderScenesAction(
          targetBucket.episodeId,
          seriesId,
          targetScenes.map((scene) => scene.id),
        );
      }

      router.refresh();
    });
    setDragId(null);
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
            className={`rounded-full px-3 py-1 text-[10px] tracking-wide ${
              showArchive ? "bg-accent-muted text-accent" : "text-muted"
            }`}
          >
            Archive ({archivedScenes.length})
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

      <section
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => !showArchive && handleDrop(currentBucket)}
      >
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
          <div ref={scrollRef} className="studio-timeline-scroll">
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
                  isSelected={selectedSceneId === scene.id}
                  isHighlighted={highlightSceneIds.includes(scene.id)}
                  isGenerating={sceneHasPendingVideoTake(sceneTakes)}
                  showArchive={showArchive}
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
                      router.refresh();
                    });
                  }}
                  onDelete={() => void handleDeleteScene(scene)}
                  onDragStart={() => setDragId(scene.id)}
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
