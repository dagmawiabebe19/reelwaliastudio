"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { ACT_GROUPS, type SceneWithBindings } from "@/lib/storyboard/constants";

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Segments</p>
        <div className="inline-flex rounded-md border border-border p-1">
          <button
            type="button"
            onClick={() => setShowArchive(false)}
            className={`rounded px-3 py-1 text-xs ${
              !showArchive ? "bg-accent-muted text-accent" : "text-muted"
            }`}
          >
            Storyboard
          </button>
          <button
            type="button"
            onClick={() => setShowArchive(true)}
            className={`rounded px-3 py-1 text-xs ${
              showArchive ? "bg-accent-muted text-accent" : "text-muted"
            }`}
          >
            Archive ({archivedScenes.length})
          </button>
        </div>
      </div>

      {!showArchive && imageModels.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-elevated/60 p-2">
          <div className="min-w-[8rem] flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              Batch still model
            </label>
            <select
              value={batchModelId}
              onChange={(e) => setBatchModelId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
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
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
              Resolution
            </label>
            <select
              value={batchResolution}
              onChange={(e) => setBatchResolution(e.target.value as "480p" | "720p")}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
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
        className="flex flex-wrap gap-2"
      >
        <input
          name="title"
          required
          placeholder="New scene title"
          className="min-w-[10rem] flex-1 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
        />
        <select
          name="actLabel"
          defaultValue="Storyboard-only"
          className="rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm"
        >
          {[...ACT_GROUPS, "Archive"].map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={pending} className="text-sm">
          New scene
        </Button>
      </form>

      <div className="max-h-56 space-y-4 overflow-y-auto pr-1">
        {(showArchive ? ["Archive"] : [...ACT_GROUPS]).map((act) => {
          const actScenes = act === "Archive" ? archivedScenes : scenesForAct(act);
          const ungeneratedCount =
            act === "Archive"
              ? 0
              : countScenesNeedingStills(activeScenes, takesByScene, act);
          const batchRunning = batchAct === act;

          return (
            <section
              key={act}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => act !== "Archive" && handleDrop(act)}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted">{act}</h3>
                {act !== "Archive" && ungeneratedCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-2 py-1 text-[10px]"
                    disabled={pending || batchRunning || !batchModel?.configured}
                    onClick={() => handleBatchStills(act, ungeneratedCount)}
                  >
                    {batchRunning
                      ? "Generating stills…"
                      : `Generate ${ungeneratedCount} still${ungeneratedCount === 1 ? "" : "s"}`}
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {actScenes.length === 0 ? (
                  <p className="text-xs text-muted">No scenes.</p>
                ) : (
                  actScenes.map((scene) => {
                    const sceneTakes = takesByScene[scene.id] ?? [];
                    const isGeneratingStill = sceneHasPendingImageStill(sceneTakes);

                    return (
                      <article
                        key={scene.id}
                        draggable={!showArchive}
                        onDragStart={() => setDragId(scene.id)}
                        onClick={() => onSelectScene(scene.id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                          selectedSceneId === scene.id
                            ? "border-accent bg-accent-muted/20"
                            : "border-border bg-surface-elevated hover:border-accent/40"
                        }`}
                      >
                        <span className="font-mono text-xs text-muted">
                          {String(scene.position ?? scene.sort_order + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{scene.title}</p>
                          <p className="text-[10px] text-muted">
                            {isGeneratingStill ? (
                              <span className="text-amber-400">Generating still…</span>
                            ) : (
                              <>
                                {scene.duration_seconds ? `${scene.duration_seconds}s` : "—"} ·{" "}
                                {scene.orientation ?? defaultOrientation}
                              </>
                            )}
                          </p>
                        </div>
                        {scene.status === "archived" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="shrink-0 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              startTransition(async () => {
                                await unarchiveSceneAction(scene.id, episodeId, seriesId);
                                router.refresh();
                              });
                            }}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            className="shrink-0 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              startTransition(async () => {
                                await archiveSceneAction(scene.id, episodeId, seriesId);
                                router.refresh();
                              });
                            }}
                          >
                            Archive
                          </Button>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
