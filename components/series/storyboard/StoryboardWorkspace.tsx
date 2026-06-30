"use client";

import { useState } from "react";
import { ScenePromptEditor, type MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import type { MentionSheet } from "@/lib/production/types";
import type { ResolvedReference } from "@/lib/production/types";
import { GenerationPanel } from "@/components/series/generation/GenerationPanel";
import { TakesStrip, type TakeCardData } from "@/components/series/generation/TakesStrip";
import { SceneMetaControls } from "@/components/series/storyboard/SceneMetaControls";
import { SceneRail } from "@/components/series/storyboard/SceneRail";
import type { Episode, Orientation } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";

interface StoryboardWorkspaceProps {
  seriesId: string;
  episodeId: string;
  episodes: Episode[];
  defaultOrientation: Orientation;
  scenes: SceneWithBindings[];
  ingredients: MentionIngredient[];
  sheets: MentionSheet[];
  seedanceConfigured: boolean;
  takesByScene: Record<string, TakeCardData[]>;
}

export function StoryboardWorkspace({
  seriesId,
  episodeId,
  episodes,
  defaultOrientation,
  scenes,
  ingredients,
  sheets,
  seedanceConfigured,
  takesByScene,
}: StoryboardWorkspaceProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

  return (
    <div className="grid grid-cols-[1fr_24rem] gap-8">
      <SceneRail
        seriesId={seriesId}
        episodeId={episodeId}
        episodes={episodes}
        defaultOrientation={defaultOrientation}
        scenes={scenes}
        selectedSceneId={selectedSceneId}
        onSelectScene={setSelectedSceneId}
        takesByScene={takesByScene}
      />

      <aside className="sticky top-8 h-fit rounded-lg border border-border bg-surface p-5">
        {selectedScene ? (
          <SceneDetailPanel
            scene={selectedScene}
            seriesId={seriesId}
            episodeId={episodeId}
            defaultOrientation={defaultOrientation}
            ingredients={ingredients}
            sheets={sheets}
            seedanceConfigured={seedanceConfigured}
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
  sheets,
  seedanceConfigured,
  takes,
}: {
  scene: SceneWithBindings;
  seriesId: string;
  episodeId: string;
  defaultOrientation: Orientation;
  ingredients: MentionIngredient[];
  sheets: MentionSheet[];
  seedanceConfigured: boolean;
  takes: TakeCardData[];
}) {
  const boundIds = scene.scene_ingredients.map((b) => b.ingredient_id);
  const boundSheetIds = (scene.scene_character_sheets ?? []).map((b) => b.character_sheet_id);
  const resolvedReferences = (scene.displayReferences ??
    scene.resolved_references ??
    []) as ResolvedReference[];

  return (
    <div className="space-y-6">
      <SceneMetaControls
        scene={scene}
        seriesId={seriesId}
        episodeId={episodeId}
        defaultOrientation={defaultOrientation}
      />

      <ScenePromptEditor
        sceneId={scene.id}
        episodeId={episodeId}
        seriesId={seriesId}
        initialPrompt={scene.prompt ?? ""}
        ingredients={ingredients}
        sheets={sheets}
        boundIngredientIds={boundIds}
        boundSheetIds={boundSheetIds}
        resolvedReferences={resolvedReferences}
      />

      <GenerationPanel
        sceneId={scene.id}
        seriesId={seriesId}
        episodeId={episodeId}
        seedanceConfigured={seedanceConfigured}
        scenePrompt={scene.prompt}
        shotIntent={scene.shot_intent}
        audioMode={scene.audio_mode}
        durationSeconds={scene.duration_seconds}
        resolvedReferences={resolvedReferences}
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
