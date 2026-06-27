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
}

export function StudioShell({
  seriesId,
  episodeId,
  seriesTitle,
  defaultOrientation,
  briefMarkdown,
  scenes,
  ingredients,
  sheets,
  characterSheets,
  models,
  takesByScene,
  chatMessages,
  scopeType,
  scopeId,
}: StudioShellProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);

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
    <div className="flex h-[calc(100vh-12rem)] min-h-[32rem] flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Episode studio</p>
        <button
          type="button"
          onClick={() => setCopilotCollapsed((v) => !v)}
          className="rounded-md border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
        >
          {copilotCollapsed ? "Show co-pilot" : "Hide co-pilot"}
        </button>
      </div>

      <div
        className={`grid min-h-0 flex-1 ${
          copilotCollapsed
            ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"
            : "grid-cols-1 xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(280px,360px)]"
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

        <aside className="flex min-h-0 flex-col overflow-y-auto p-4 xl:border-l xl:border-border">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            Output
          </p>

          {selectedScene ? (
            <div className="space-y-6">
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
