"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveSceneAction,
  createSceneAction,
  reorderScenesAction,
  unarchiveSceneAction,
  updateSceneAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import { ScenePromptEditor, type MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import { GenerationPanel, type ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import { TakesStrip, type TakeCardData } from "@/components/series/generation/TakesStrip";
import { Button } from "@/components/ui/Button";
import type { Orientation } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import { ACT_GROUPS } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

interface StoryboardWorkspaceProps {
  seriesId: string;
  episodeId: string;
  defaultOrientation: Orientation;
  scenes: SceneWithBindings[];
  ingredients: MentionIngredient[];
  models: ModelCatalogEntry[];
  takesByScene: Record<string, TakeCardData[]>;
}

export function StoryboardWorkspace({
  seriesId,
  episodeId,
  defaultOrientation,
  scenes,
  ingredients,
  models,
  takesByScene,
}: StoryboardWorkspaceProps) {
  const router = useRouter();
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [showArchive, setShowArchive] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  const activeScenes = scenes.filter((s) => s.status !== "archived");
  const archivedScenes = scenes.filter((s) => s.status === "archived");
  const visibleScenes = showArchive ? archivedScenes : activeScenes;

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

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

  return (
    <div className="grid grid-cols-[1fr_24rem] gap-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-md border border-border p-1">
            <button
              type="button"
              onClick={() => setShowArchive(false)}
              className={`rounded px-3 py-1.5 text-sm ${
                !showArchive ? "bg-primary text-primary-foreground" : "text-muted"
              }`}
            >
              Storyboard
            </button>
            <button
              type="button"
              onClick={() => setShowArchive(true)}
              className={`rounded px-3 py-1.5 text-sm ${
                showArchive ? "bg-primary text-primary-foreground" : "text-muted"
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
          className="flex flex-wrap gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <input
            name="title"
            required
            placeholder="New scene title"
            className="min-w-[12rem] flex-1 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
          />
          <select
            name="actLabel"
            defaultValue="Storyboard-only"
            className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
          >
            {[...ACT_GROUPS, "Archive"].map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={pending}>
            New Scene
          </Button>
        </form>

        {(showArchive ? ["Archive"] : [...ACT_GROUPS]).map((act) => {
          const actScenes =
            act === "Archive"
              ? archivedScenes
              : scenesForAct(act);
          return (
            <section
              key={act}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => act !== "Archive" && handleDrop(act)}
            >
              <h3 className="mb-3 font-display text-lg text-foreground">{act}</h3>
              <div className="grid gap-3">
                {actScenes.length === 0 ? (
                  <p className="text-sm text-muted">No scenes.</p>
                ) : (
                  actScenes.map((scene) => (
                    <article
                      key={scene.id}
                      draggable={!showArchive}
                      onDragStart={() => setDragId(scene.id)}
                      onClick={() => setSelectedSceneId(scene.id)}
                      className={`flex cursor-pointer gap-4 rounded-lg border p-4 transition-colors ${
                        selectedSceneId === scene.id
                          ? "border-accent bg-accent-muted/20"
                          : "border-border bg-surface hover:border-accent/50"
                      }`}
                    >
                      <div className="h-16 w-24 shrink-0 rounded bg-background" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {scene.position ?? scene.sort_order + 1}. {scene.title}
                        </p>
                        <p className="text-xs text-muted">
                          {scene.duration_seconds ? `${scene.duration_seconds}s` : "—"} ·{" "}
                          {scene.orientation ?? defaultOrientation}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        {scene.status === "archived" ? (
                          <Button
                            type="button"
                            variant="ghost"
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
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <aside className="sticky top-8 h-fit rounded-lg border border-border bg-surface p-5">
        {selectedScene ? (
          <SceneDetailPanel
            scene={selectedScene}
            seriesId={seriesId}
            episodeId={episodeId}
            defaultOrientation={defaultOrientation}
            ingredients={ingredients}
            models={models}
            takes={takesByScene[selectedScene.id] ?? []}
          />
        ) : (
          <p className="text-sm text-muted">Select a scene to edit.</p>
        )}
      </aside>
    </div>
  );
}

function SceneDetailPanel({
  scene,
  seriesId,
  episodeId,
  defaultOrientation,
  ingredients,
  models,
  takes,
}: {
  scene: SceneWithBindings;
  seriesId: string;
  episodeId: string;
  defaultOrientation: Orientation;
  ingredients: MentionIngredient[];
  models: ModelCatalogEntry[];
  takes: TakeCardData[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [duration, setDuration] = useState(String(scene.duration_seconds ?? ""));
  const [orientation, setOrientation] = useState<Orientation | "">(
    scene.orientation ?? "",
  );

  const boundIds = scene.scene_ingredients.map((b) => b.ingredient_id);

  function saveMeta() {
    startTransition(async () => {
      const result = await updateSceneAction(scene.id, episodeId, seriesId, {
        duration_seconds: duration ? Number(duration) : null,
        orientation: orientation === "" ? null : orientation,
      });
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl text-foreground">{scene.title}</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Duration (s)</label>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Orientation</label>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation | "")}
            className="w-full rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm"
          >
            <option value="">Default ({defaultOrientation})</option>
            <option value="portrait">Portrait 9:16</option>
            <option value="landscape">Landscape 16:9</option>
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={saveMeta}
        disabled={pending}
        className="text-sm text-accent hover:underline disabled:opacity-50"
      >
        Save settings
      </button>

      <ScenePromptEditor
        sceneId={scene.id}
        episodeId={episodeId}
        seriesId={seriesId}
        initialPrompt={scene.prompt ?? ""}
        ingredients={ingredients}
        boundIngredientIds={boundIds}
      />

      <GenerationPanel
        sceneId={scene.id}
        seriesId={seriesId}
        episodeId={episodeId}
        models={models}
      />

      <TakesStrip
        sceneId={scene.id}
        seriesId={seriesId}
        episodeId={episodeId}
        sceneTitle={scene.title}
        orientation={effectiveOrientation(scene.orientation, defaultOrientation)}
        takes={takes}
      />
    </div>
  );
}
