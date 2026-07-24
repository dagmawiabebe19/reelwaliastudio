"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, MonitorPlay } from "lucide-react";
import { CopilotContextRegistrar } from "@/components/copilot/CopilotContextRegistrar";
import { EmptyState } from "@/components/ui/EmptyState";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { GenerationPanel } from "@/components/series/generation/GenerationPanel";
import { EpisodeBatchGenerationPanel } from "@/components/series/generation/EpisodeBatchGenerationPanel";
import { TakesStrip, type TakeCardData } from "@/components/series/generation/TakesStrip";
import { StudioIngredientsPanel } from "@/components/series/studio/StudioIngredientsPanel";
import { SceneMetaControls } from "@/components/series/storyboard/SceneMetaControls";
import {
  ScenePromptEditor,
  type ScenePromptEditorHandle,
} from "@/components/series/storyboard/ScenePromptEditor";
import { SceneRail } from "@/components/series/storyboard/SceneRail";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import type { MentionSheet } from "@/lib/production/types";
import type { CharacterSheetCardData, IngredientCardData, ResolvedReference } from "@/lib/production/types";
import type { Orientation, Episode } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";
import { effectiveOrientation } from "@/lib/storyboard/orientation";
import { pollEpisodeTakesAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/studio-poll-actions";
import { useStatusPoll } from "@/hooks/useStatusPoll";
import {
  isInFlightGenerationStatus,
  statusFingerprint,
} from "@/lib/generation/in-flight-status";
import { noteStudioRender } from "@/lib/debug/studio-render-count";

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
  seedanceConfigured: boolean;
  takesByScene: Record<string, TakeCardData[]>;
  chatMessages: ChatMessageData[];
  showIngredients: boolean;
  onCloseIngredients: () => void;
  libraryIngredients: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  showOnboardingSegments?: boolean;
}

function flattenTakeFingerprint(takesByScene: Record<string, TakeCardData[]>): string {
  const rows: Array<{ id: string; status: string }> = [];
  for (const takes of Object.values(takesByScene)) {
    for (const take of takes) {
      rows.push({ id: take.id, status: take.status });
    }
  }
  return statusFingerprint(rows);
}

function hasInFlightTakes(takesByScene: Record<string, TakeCardData[]>): boolean {
  return Object.values(takesByScene).some((takes) =>
    takes.some((take) => isInFlightGenerationStatus(take.status)),
  );
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
  seedanceConfigured,
  takesByScene: takesBySceneProp,
  chatMessages,
  showIngredients,
  onCloseIngredients,
  libraryIngredients,
  costumesByCharacter,
  sheetsByCharacter,
  showOnboardingSegments = false,
}: StudioShellProps) {
  noteStudioRender("StudioShell");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [activeTakeIndex, setActiveTakeIndex] = useState(0);
  const [promptDraft, setPromptDraft] = useState("");
  const [takesByScene, setTakesByScene] = useState(takesBySceneProp);
  const sceneContentRef = useRef<HTMLDivElement>(null);
  const promptEditorRef = useRef<ScenePromptEditorHandle>(null);
  const takesFingerprintRef = useRef(flattenTakeFingerprint(takesBySceneProp));

  const sceneIdsKey = useMemo(() => scenes.map((s) => s.id).join(","), [scenes]);

  useEffect(() => {
    setTakesByScene(takesBySceneProp);
    takesFingerprintRef.current = flattenTakeFingerprint(takesBySceneProp);
  }, [takesBySceneProp]);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;
  const sceneOrientation = selectedScene
    ? effectiveOrientation(selectedScene.orientation, defaultOrientation)
    : defaultOrientation;
  const sceneTakes = selectedScene ? (takesByScene[selectedScene.id] ?? []) : [];
  const activeTake = sceneTakes[activeTakeIndex] ?? sceneTakes[sceneTakes.length - 1];

  const selectedPrompt = selectedScene?.prompt ?? "";
  useEffect(() => {
    setActiveTakeIndex(0);
    setPromptDraft(selectedPrompt);
    const panel = sceneContentRef.current;
    if (panel) panel.scrollTop = 0;
  }, [selectedSceneId, selectedPrompt]);

  useEffect(() => {
    if (!sceneIdsKey) {
      setSelectedSceneId(null);
      return;
    }
    const ids = sceneIdsKey.split(",");
    if (!selectedSceneId || !ids.includes(selectedSceneId)) {
      setSelectedSceneId(ids[0] ?? null);
    }
  }, [sceneIdsKey, selectedSceneId]);

  const takesInFlight = hasInFlightTakes(takesByScene);

  const pollTakes = useCallback(async () => {
    const sceneIds = sceneIdsKey ? sceneIdsKey.split(",").filter(Boolean) : [];
    if (!sceneIds.length) return "stop" as const;

    const result = await pollEpisodeTakesAction({ seriesId, episodeId, sceneIds });
    if ("error" in result && result.error) {
      return "continue" as const;
    }
    if (!("takesByScene" in result) || !result.takesByScene) {
      return "continue" as const;
    }

    const next = result.takesByScene as Record<string, TakeCardData[]>;
    const nextFp = flattenTakeFingerprint(next);
    const prevFp = takesFingerprintRef.current;
    const stillInFlight = hasInFlightTakes(next);

    if (nextFp === prevFp) {
      return stillInFlight ? ("continue" as const) : ("stop" as const);
    }

    takesFingerprintRef.current = nextFp;
    setTakesByScene(next);
    return "transition" as const;
  }, [episodeId, sceneIdsKey, seriesId]);

  useStatusPoll({
    active: takesInFlight,
    intervalMs: 3000,
    onPoll: pollTakes,
    refreshOnTransition: true,
    maxStagnantTicks: 40,
  });

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

  return (
    <>
      <CopilotContextRegistrar registration={copilotRegistration} />
      <div className="studio-editing-bay flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid h-full min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,7fr)_minmax(240px,5fr)]">
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-border xl:border-b-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
            {showIngredients ? (
              <div className="flex max-h-[38vh] min-h-0 w-full shrink-0 flex-col border-b border-border/80 md:max-h-none md:w-[min(100%,18rem)] md:border-b-0 md:border-r">
                <StudioIngredientsPanel
                  seriesId={seriesId}
                  ingredients={libraryIngredients}
                  costumesByCharacter={costumesByCharacter}
                  sheetsByCharacter={sheetsByCharacter}
                  mentionSheets={sheets}
                  prompt={promptDraft}
                  boundIngredientIds={
                    selectedScene?.scene_ingredients.map((b) => b.ingredient_id) ?? []
                  }
                  boundSheetIds={
                    (selectedScene?.scene_character_sheets ?? []).map(
                      (b) => b.character_sheet_id,
                    )
                  }
                  hasActiveScene={Boolean(selectedScene)}
                  onInsertIngredient={(ingredient) =>
                    promptEditorRef.current?.insertIngredient(ingredient)
                  }
                  onInsertSheet={(sheet) => promptEditorRef.current?.insertSheet(sheet)}
                  onClose={onCloseIngredients}
                />
              </div>
            ) : null}

            <div
              ref={sceneContentRef}
              className="min-h-0 min-w-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-5 py-6"
            >
              {selectedScene ? (
                <>
                  <SceneMetaControls
                    scene={selectedScene}
                    seriesId={seriesId}
                    episodeId={episodeId}
                    defaultOrientation={defaultOrientation}
                  />

                  <ScenePromptEditor
                    ref={promptEditorRef}
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
                    onPromptChange={setPromptDraft}
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
                    enableStatusPoll={false}
                  />
                </>
              ) : (
                <div className="space-y-4">
                  {showOnboardingSegments ? (
                    <OnboardingGuide phase="studio-segments" />
                  ) : null}
                  <EmptyState
                    variant="preview"
                    icon={Clapperboard}
                    title="Episode studio"
                    description="Select a segment below to edit its shot and generate takes."
                    className="min-h-[12rem]"
                  />
                </div>
              )}
            </div>
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
            />
          </div>
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden xl:border-l xl:border-border/80">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-6">
            <p className="mb-4 studio-section-label">Output</p>

            <EpisodeBatchGenerationPanel
              seriesId={seriesId}
              episodeId={episodeId}
              scenes={scenes}
              takesByScene={takesByScene}
              seedanceConfigured={seedanceConfigured}
              enableStatusPoll={false}
            />

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
                  enableStatusPoll={false}
                />

                <GenerationPanel
                  sceneId={selectedScene.id}
                  seriesId={seriesId}
                  episodeId={episodeId}
                  seedanceConfigured={seedanceConfigured}
                  scenePrompt={selectedScene.prompt}
                  shotIntent={selectedScene.shot_intent}
                  audioMode={selectedScene.audio_mode}
                  durationSeconds={selectedScene.duration_seconds}
                  resolvedReferences={
                    selectedScene.displayReferences ??
                    ((selectedScene.resolved_references ?? []) as ResolvedReference[])
                  }
                />
              </div>
            ) : (
              <EmptyState
                variant="preview"
                icon={MonitorPlay}
                title="No segment selected"
                description="Pick a segment from the timeline below to preview and generate."
                className="min-h-[10rem]"
              />
            )}
          </div>
        </aside>
      </div>
    </div>
    </>
  );
}
