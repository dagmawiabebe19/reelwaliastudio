"use client";

import { useState } from "react";
import { CopilotPane, type ChatMessageData, type CopilotContextPayload, type MentionIngredient } from "@/components/series/copilot/CopilotPane";
import { GenerationPanel, type ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import { TakesStrip, type TakeCardData } from "@/components/series/generation/TakesStrip";
import { ScenePromptEditor } from "@/components/series/storyboard/ScenePromptEditor";
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
  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

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
    <div className="grid h-[calc(100vh-12rem)] grid-cols-2 gap-4 rounded-lg border border-border bg-surface">
      <div className="flex min-h-0 flex-col border-r border-border p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Co-pilot</p>
        <CopilotPane
          scopeType={scopeType}
          scopeId={scopeId}
          context={copilotContext}
          imageModels={models.filter((m) => m.kind === "image")}
          ingredients={ingredients}
          initialMessages={chatMessages}
        />
      </div>

      <div className="flex min-h-0 flex-col overflow-y-auto p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Scene + Takes
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => setSelectedSceneId(scene.id)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                selectedSceneId === scene.id
                  ? "border-accent bg-accent-muted text-accent"
                  : "border-border text-muted hover:text-accent"
              }`}
            >
              {scene.title}
            </button>
          ))}
        </div>

        {selectedScene ? (
          <div className="space-y-6">
            <h2 className="font-display text-2xl text-foreground">{selectedScene.title}</h2>

            <ScenePromptEditor
              sceneId={selectedScene.id}
              episodeId={episodeId}
              seriesId={seriesId}
              initialPrompt={selectedScene.prompt ?? ""}
              ingredients={ingredients}
              sheets={sheets}
              boundIngredientIds={selectedScene.scene_ingredients.map((b) => b.ingredient_id)}
              boundSheetIds={(selectedScene.scene_character_sheets ?? []).map((b) => b.character_sheet_id)}
              resolvedReferences={(selectedScene.resolved_references ?? []) as ResolvedReference[]}
            />

            <GenerationPanel
              sceneId={selectedScene.id}
              seriesId={seriesId}
              episodeId={episodeId}
              models={models}
            />

            <TakesStrip
              sceneId={selectedScene.id}
              seriesId={seriesId}
              episodeId={episodeId}
              sceneTitle={selectedScene.title}
              orientation={effectiveOrientation(selectedScene.orientation, defaultOrientation)}
              takes={takesByScene[selectedScene.id] ?? []}
            />
          </div>
        ) : (
          <p className="text-sm text-muted">Select a scene to generate takes.</p>
        )}
      </div>
    </div>
  );
}
