"use client";

import { useEffect, useMemo, useState } from "react";
import { useRegisterCopilotContext } from "@/components/copilot/CopilotWorkspaceProvider";
import { GenerationPanel, type ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import { TakesStrip, type TakeCardData } from "@/components/series/generation/TakesStrip";
import { SceneMetaControls } from "@/components/series/storyboard/SceneMetaControls";
import { ScenePromptEditor } from "@/components/series/storyboard/ScenePromptEditor";
import { SceneRail } from "@/components/series/storyboard/SceneRail";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import type { MentionSheet } from "@/lib/production/types";
import type { ResolvedReference } from "@/lib/production/types";
import type { Orientation, Episode } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

interface StudioShellProps {
  seriesId: string;
  episodeId: string;
  episodeTitle: string;
  episodes: Episode[];
  seriesTitle: string;
  defaultOrientation: Orientation;
  briefMarkdown: string;
  seriesMemoryMarkdown?: string;
  scenes: SceneWithBindings[];
  ingredients: MentionIngredient[];
  sheets: MentionSheet[];
  characterSheets: Array<{
    id: string;
    name: string;
    character_id: string;
    character_name: string;
    costume_name: string | null;
    status: string;
    episode_ids: string[];
  }>;
  models: ModelCatalogEntry[];
  takesByScene: Record<string, TakeCardData[]>;
  chatMessages: ChatMessageData[];
}

export function StudioShell({
  seriesId,
  episodeId,
  episodeTitle,
  episodes,
  seriesTitle,
  defaultOrientation,
  briefMarkdown,
  seriesMemoryMarkdown,
  scenes,
  ingredients,
  sheets,
  characterSheets,
  models,
  takesByScene,
  chatMessages,
}: StudioShellProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;
  const sceneOrientation = selectedScene
    ? effectiveOrientation(selectedScene.orientation, defaultOrientation)
    : defaultOrientation;
  const sceneTakes = selectedScene ? (takesByScene[selectedScene.id] ?? []) : [];
  const activeTake = sceneTakes[activeTakeIndex] ?? sceneTakes[sceneTakes.length - 1];

  useEffect(() => {
    setActiveTakeIndex(0);
  }, [selectedSceneId]);

  useEffect(() => {
    if (!scenes.length) {
      setSelectedSceneId(null);
      return;
    }
    if (!selectedSceneId || !scenes.some((scene) => scene.id === selectedSceneId)) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  const sceneIndex = selectedScene ? scenes.findIndex((s) => s.id === selectedScene.id) + 1 : null;
  const activeTakeSummary = activeTake
    ? `Take #${activeTake.take_number} — ${activeTake.status}${activeTake.error_message ? ` (${activeTake.error_message})` : ""}`
    : undefined;

  const copilotRegistration = useMemo(
    () => ({
      scopeType: "episode" as const,
      scopeId: episodeId,
      context: {
        seriesId,
        episodeId,
        sceneId: selectedSceneId ?? undefined,
        seriesTitle,
        defaultOrientation,
        briefMarkdown,
        seriesMemoryMarkdown,
        scenes: scenes.map((s) => ({
          id: s.id,
          title: s.title,
          prompt: s.prompt,
          act_label: s.act_label,
          shot_intent: s.shot_intent,
        })),
        ingredients: ingredients.map((i) => ({
          id: i.id,
          ref_tag: i.ref_tag,
          name: i.name,
          kind: "character",
        })),
        characterSheets,
        workspace: {
          view: "episode-studio",
          viewLabel: selectedScene
            ? `Episode · Scene ${sceneIndex}: ${selectedScene.title}`
            : `Episode · ${episodeTitle}`,
          episodeTitle,
          sceneTitle: selectedScene?.title,
          scenePrompt: selectedScene?.prompt,
          sceneActLabel: selectedScene?.act_label,
          activeTakeSummary,
        },
      },
      ingredients,
      initialMessages: chatMessages,
    }),
    [
      seriesId,
      episodeId,
      episodeTitle,
      seriesTitle,
      defaultOrientation,
      briefMarkdown,
      seriesMemoryMarkdown,
      scenes,
      ingredients,
      characterSheets,
      chatMessages,
      selectedSceneId,
      selectedScene?.title,
      selectedScene?.prompt,
      selectedScene?.act_label,
      sceneIndex,
      activeTakeSummary,
    ],
  );

  useRegisterCopilotContext(copilotRegistration);

  return (
    <div className="studio-editing-bay flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(240px,5fr)]">
        <main className="flex min-h-0 min-w-0 flex-col border-b border-border xl:border-b-0">
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-6">
            {selectedScene ? (
              <>
                <SceneMetaControls
                  scene={selectedScene}
                  seriesId={seriesId}
                  episodeId={episodeId}
                  defaultOrientation={defaultOrientation}
                />

                <ScenePromptEditor
                  sceneId={selectedScene.id}
                  episodeId={episodeId}
                  seriesId={seriesId}
                  initialPrompt={selectedScene.prompt ?? ""}
                  ingredients={ingredients}
                  sheets={sheets}
                  boundIngredientIds={selectedScene.scene_ingredients.map((b) => b.ingredient_id)}
                  boundSheetIds={(selectedScene.scene_character_sheets ?? []).map(
                    (b) => b.character_sheet_id,
                  )}
                  resolvedReferences={
                    selectedScene.displayReferences ??
                    ((selectedScene.resolved_references ?? []) as ResolvedReference[])
                  }
                />

                <TakesStrip
                  sceneId={selectedScene.id}
                  seriesId={seriesId}
                  episodeId={episodeId}
                  sceneTitle={selectedScene.title}
                  orientation={sceneOrientation}
                  takes={sceneTakes}
                  layout="strip"
                  activeIndex={activeTakeIndex}
                  onActiveIndexChange={setActiveTakeIndex}
                />
              </>
            ) : (
              <div className="studio-empty-preview">
                <p className="font-display text-xs tracking-widest text-muted">Episode studio</p>
                <p className="text-sm">Select a segment below to begin.</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border/80 bg-surface/80 px-5 py-4 backdrop-blur-sm">
            <SceneRail
              seriesId={seriesId}
              episodeId={episodeId}
              episodes={episodes}
              defaultOrientation={defaultOrientation}
              scenes={scenes}
              selectedSceneId={selectedSceneId}
              onSelectScene={setSelectedSceneId}
              takesByScene={takesByScene}
              models={models}
            />
          </div>
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto overflow-x-hidden px-5 py-6 xl:border-l xl:border-border/80">
          <p className="mb-4 studio-section-label">Output</p>

          {selectedScene ? (
            <div className="min-w-0 space-y-6">
              <TakesStrip
                sceneId={selectedScene.id}
                seriesId={seriesId}
                episodeId={episodeId}
                sceneTitle={selectedScene.title}
                orientation={sceneOrientation}
                takes={sceneTakes}
                layout="preview"
                activeIndex={activeTakeIndex}
                onActiveIndexChange={setActiveTakeIndex}
              />

              <GenerationPanel
                sceneId={selectedScene.id}
                seriesId={seriesId}
                episodeId={episodeId}
                models={models}
                takes={sceneTakes}
                scenePrompt={selectedScene.prompt}
                shotIntent={selectedScene.shot_intent}
                resolvedReferences={
                  selectedScene.displayReferences ??
                  ((selectedScene.resolved_references ?? []) as ResolvedReference[])
                }
              />
            </div>
          ) : (
            <div className="studio-empty-preview">
              <p className="text-sm">Select a segment to preview and generate.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
