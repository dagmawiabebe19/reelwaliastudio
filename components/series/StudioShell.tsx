"use client";

import { useEffect, useState } from "react";
import {
  CopilotPane,
  type ChatMessageData,
  type CopilotContextPayload,
  type MentionIngredient,
} from "@/components/series/copilot/CopilotPane";
import { GenerationPanel, type ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import { TakesStrip, type TakeCardData } from "@/components/series/generation/TakesStrip";
import { SceneMetaControls } from "@/components/series/storyboard/SceneMetaControls";
import { ScenePromptEditor } from "@/components/series/storyboard/ScenePromptEditor";
import { SceneRail } from "@/components/series/storyboard/SceneRail";
import type { MentionSheet } from "@/lib/production/types";
import type { ResolvedReference } from "@/lib/production/types";
import type { Orientation } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

interface StudioShellProps {
  seriesId: string;
  episodeId: string;
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
  scopeType: "episode" | "scene";
  scopeId: string;
  copilotCollapsed?: boolean;
}

export function StudioShell({
  seriesId,
  episodeId,
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
  scopeType,
  scopeId,
  copilotCollapsed: copilotCollapsedProp,
}: StudioShellProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [copilotCollapsedInternal] = useState(false);
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);

  const copilotCollapsed = copilotCollapsedProp ?? copilotCollapsedInternal;

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;
  const sceneOrientation = selectedScene
    ? effectiveOrientation(selectedScene.orientation, defaultOrientation)
    : defaultOrientation;
  const sceneTakes = selectedScene ? (takesByScene[selectedScene.id] ?? []) : [];

  useEffect(() => {
    setActiveTakeIndex(0);
  }, [selectedSceneId]);

  const copilotContext: CopilotContextPayload = {
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
    })),
    ingredients: ingredients.map((i) => ({
      id: i.id,
      ref_tag: i.ref_tag,
      name: i.name,
      kind: "character",
    })),
    characterSheets,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
      <div
        className={`grid min-h-0 flex-1 ${
          copilotCollapsed
            ? "grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(240px,5fr)]"
            : "grid-cols-1 xl:grid-cols-[minmax(320px,8fr)_minmax(0,7fr)_minmax(240px,5fr)]"
        }`}
      >
        {!copilotCollapsed ? (
          <aside className="flex min-h-0 flex-col border-b border-border p-4 xl:border-b-0 xl:border-r">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Co-pilot
            </p>
            <CopilotPane
              scopeType={scopeType}
              scopeId={scopeId}
              context={copilotContext}
              imageModels={models.filter((m) => m.kind === "image")}
              ingredients={ingredients}
              initialMessages={chatMessages}
            />
          </aside>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-col border-b border-border xl:border-b-0">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
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
                  resolvedReferences={(selectedScene.resolved_references ?? []) as ResolvedReference[]}
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
              <p className="text-sm text-muted">Select a scene below to edit and generate.</p>
            )}
          </div>

          <div className="shrink-0 border-t border-border bg-surface-elevated/30 p-4">
            <SceneRail
              seriesId={seriesId}
              episodeId={episodeId}
              defaultOrientation={defaultOrientation}
              scenes={scenes}
              selectedSceneId={selectedSceneId}
              onSelectScene={setSelectedSceneId}
            />
          </div>
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-y-auto overflow-x-hidden p-4 xl:border-l xl:border-border">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Output
          </p>

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
              />
            </div>
          ) : (
            <p className="text-sm text-muted">Select a scene to preview takes and generate.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
