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
import { generateEpisodeStillsAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { Button } from "@/components/ui/Button";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import type { Orientation } from "@/lib/db/types";
import {
  countScenesNeedingStills,
  sceneHasPendingImageStill,
} from "@/lib/ai/generation/batch-stills";
import {
  countReadyTakes,
  orientationAspectClass,
  resolveRepresentativeTake,
} from "@/lib/storyboard/studio-visuals";
import { ACT_GROUPS, type SceneWithBindings } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

interface SceneRailProps {
  seriesId: string;
  episodeId: string;
  defaultOrientation: Orientation;
  scenes: SceneWithBindings[];
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  takesByScene?: Record<string, TakeCardData[]>;
  models?: ModelCatalogEntry[];
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
  isGenerating,
  showArchive,
  menuOpen,
  onToggleMenu,
  onSelect,
  onArchive,
  onRestore,
  onDragStart,
}: {
  scene: SceneWithBindings;
  sceneNumber: number;
  orientation: Orientation;
  takes: TakeCardData[];
  isSelected: boolean;
  isGenerating: boolean;
  showArchive: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDragStart: () => void;
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
      draggable={!showArchive}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={`studio-segment-card group w-[7.5rem] ${isSelected ? "studio-segment-card--active" : ""} ${
        isUngenerated ? "studio-segment-card--ungenerated" : ""
      }`}
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
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[6rem] rounded-md border border-border bg-surface-elevated py-1 shadow-lg">
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
  defaultOrientation,
  scenes,
  selectedSceneId,
  onSelectScene,
  takesByScene = {},
  models = [],
}: SceneRailProps) {
  const router = useRouter();
  const [showArchive, setShowArchive] = useState(false);
  const [pending, startTransition] = useTransition();
  const [batchAct, setBatchAct] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeAct, setActiveAct] = useState<string>(ACT_GROUPS[0]);

  const imageModels = useMemo(
    () => models.filter((model) => model.kind === "image"),
    [models],
  );
  const defaultImageModelId =
    imageModels.find((model) => model.configured)?.id ?? imageModels[0]?.id ?? "";
  const [batchModelId, setBatchModelId] = useState(defaultImageModelId);
  const [batchResolution, setBatchResolution] = useState<"480p" | "720p">("720p");

  useEffect(() => {
    if (!batchModelId && defaultImageModelId) {
      setBatchModelId(defaultImageModelId);
    }
  }, [batchModelId, defaultImageModelId]);

  const activeScenes = scenes.filter((s) => s.status !== "archived");
  const archivedScenes = scenes.filter((s) => s.status === "archived");
  const visibleScenes = showArchive ? archivedScenes : activeScenes;
  const batchModel = imageModels.find((model) => model.id === batchModelId);

  function scenesForAct(act: string) {
    return visibleScenes.filter((s) => (s.act_label ?? "Storyboard-only") === act);
  }

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createSceneAction(episodeId, seriesId, formData);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  function handleDrop(targetAct: string) {
    if (!dragId) return;
    const ordered = [...activeScenes];
    const fromIndex = ordered.findIndex((s) => s.id === dragId);
    if (fromIndex < 0) return;
    const [moved] = ordered.splice(fromIndex, 1);
    moved.act_label = targetAct;
    ordered.push(moved);

    startTransition(async () => {
      await updateSceneAction(dragId, episodeId, seriesId, { act_label: targetAct });
      await reorderScenesAction(
        episodeId,
        seriesId,
        ordered.map((s) => s.id),
      );
      router.refresh();
    });
    setDragId(null);
  }

  function handleBatchStills(act: string, count: number) {
    if (!batchModelId || !batchModel?.configured || count < 1) return;

    const modelLabel = batchModel.label;
    const confirmed = window.confirm(
      `Generate ${count} still${count === 1 ? "" : "s"} for ${act} using ${modelLabel} at ${batchResolution}?`,
    );
    if (!confirmed) return;

    setBatchAct(act);
    startTransition(async () => {
      const result = await generateEpisodeStillsAction({
        episodeId,
        seriesId,
        modelId: batchModelId,
        resolution: batchResolution,
        actLabel: act,
      });

      if ("error" in result && result.error) {
        alert(result.error);
        setBatchAct(null);
        return;
      }

      router.refresh();
    });
  }

  useEffect(() => {
    if (!batchAct) return;

    const actScenes = activeScenes.filter(
      (scene) => (scene.act_label ?? "Storyboard-only") === batchAct,
    );
    const stillPending = actScenes.some((scene) =>
      sceneHasPendingImageStill(takesByScene[scene.id] ?? []),
    );

    if (!stillPending) {
      setBatchAct(null);
      return;
    }

    const interval = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(interval);
  }, [batchAct, takesByScene, activeScenes, router]);

  const actTabs = showArchive ? ["Archive"] : [...ACT_GROUPS];
  const currentAct = showArchive ? "Archive" : activeAct;
  const actScenes = currentAct === "Archive" ? archivedScenes : scenesForAct(currentAct);
  const ungeneratedCount =
    currentAct === "Archive"
      ? 0
      : countScenesNeedingStills(activeScenes, takesByScene, currentAct);
  const batchRunning = batchAct === currentAct;

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

      {!showArchive && imageModels.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/80 bg-surface px-3 py-2">
          <div className="min-w-[7rem] flex-1">
            <label className="mb-1 block studio-section-label">Batch model</label>
            <select
              value={batchModelId}
              onChange={(e) => setBatchModelId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            >
              {imageModels.map((model) => (
                <option key={model.id} value={model.id} disabled={!model.configured}>
                  {model.label}
                  {!model.configured ? " — not configured" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block studio-section-label">Res</label>
            <select
              value={batchResolution}
              onChange={(e) => setBatchResolution(e.target.value as "480p" | "720p")}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            >
              <option value="480p">480p</option>
              <option value="720p">720p</option>
            </select>
          </div>
        </div>
      ) : null}

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
        <select
          name="actLabel"
          defaultValue="Storyboard-only"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          {[...ACT_GROUPS, "Archive"].map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending} className="text-sm">
          Add
        </Button>
      </form>

      {!showArchive ? (
        <div className="flex flex-wrap gap-1 border-b border-border pb-2">
          {ACT_GROUPS.map((act) => (
            <button
              key={act}
              type="button"
              onClick={() => setActiveAct(act)}
              className={`rounded-full px-3 py-1 text-[10px] tracking-wider ${
                activeAct === act
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {act.replace("_", " ")}
            </button>
          ))}
        </div>
      ) : null}

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => currentAct !== "Archive" && handleDrop(currentAct)}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="studio-section-label">{currentAct.replace("_", " ")}</h3>
          {currentAct !== "Archive" && ungeneratedCount > 0 ? (
            <button
              type="button"
              className="text-[10px] tracking-wide text-accent hover:underline disabled:opacity-50"
              disabled={pending || batchRunning || !batchModel?.configured}
              onClick={() => handleBatchStills(currentAct, ungeneratedCount)}
            >
              {batchRunning
                ? "Generating stills…"
                : `Generate ${ungeneratedCount} still${ungeneratedCount === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </div>

        {actScenes.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">No segments in this bucket.</p>
        ) : (
          <div className="studio-timeline-scroll">
            {actScenes.map((scene) => {
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
                  isGenerating={sceneHasPendingImageStill(sceneTakes)}
                  showArchive={showArchive}
                  menuOpen={openMenuId === scene.id}
                  onToggleMenu={() =>
                    setOpenMenuId((id) => (id === scene.id ? null : scene.id))
                  }
                  onSelect={() => onSelectScene(scene.id)}
                  onArchive={() => {
                    setOpenMenuId(null);
                    startTransition(async () => {
                      await archiveSceneAction(scene.id, episodeId, seriesId);
                      router.refresh();
                    });
                  }}
                  onRestore={() => {
                    setOpenMenuId(null);
                    startTransition(async () => {
                      await unarchiveSceneAction(scene.id, episodeId, seriesId);
                      router.refresh();
                    });
                  }}
                  onDragStart={() => setDragId(scene.id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
