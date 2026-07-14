"use client";

import { useMemo, useState } from "react";
import { useRegisterCopilotContext } from "@/components/copilot/CopilotWorkspaceProvider";
import { OrientationToggle } from "@/components/series/OrientationToggle";
import { SeriesBriefEditor } from "@/components/series/SeriesBriefEditor";
import { SeriesMemoryEditor } from "@/components/series/SeriesMemoryEditor";
import { StatTiles } from "@/components/series/StatTiles";
import { StatusDot, type StatusVariant } from "@/components/ui/StatusDot";
import { ViewToggle } from "@/components/series/ViewToggle";
import {
  SeriesStudioOutputPanel,
  useSeriesStudioOutput,
} from "@/components/series/SeriesStudioShell";
import { KeyArtSection } from "@/components/series/KeyArtSection";
import { ScreenplaySection, type ScreenplayCardData } from "@/components/series/ScreenplaySection";
import { IngredientsSection } from "@/components/series/ingredients/IngredientsSection";
import {
  EpisodesSection,
  type EpisodeCardData,
} from "@/components/series/episodes/EpisodesSection";
import type { Orientation, SeriesStatus } from "@/lib/db/types";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { CopilotOutputItem, LibraryHighlight } from "@/lib/copilot/output";
import type { CharacterSheetCardData, EpisodeOption, IngredientCardData } from "@/lib/production/types";
import { SeriesReferenceStylePanel } from "@/components/series/SeriesReferenceStylePanel";
import type { Json } from "@/lib/db/database.types";

type Tab = "ingredients" | "episodes" | "brief" | "memory";

const TAB_LABELS: Record<Tab, string> = {
  ingredients: "Ingredients",
  episodes: "Episodes",
  brief: "Series Brief",
  memory: "Memory",
};

const statusLabels: Record<SeriesStatus, string> = {
  in_progress: "In progress",
  validated: "Validated",
  released: "Released",
};

interface SeriesWorkspaceProps {
  series: {
    id: string;
    title: string;
    slug: string;
    status: SeriesStatus;
    default_orientation: Orientation;
    brief_markdown: string;
    memory_markdown: string;
    reference_style?: string | null;
    restyle_cascade?: Json | null;
  };
  stats: {
    episodeCount: number;
  };
  counts: {
    total: number;
    characters: number;
    voices: number;
    outfits: number;
    locations: number;
    reference: number;
  };
  ingredients: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  episodes: EpisodeOption[];
  characterSheets: Array<{
    id: string;
    name: string;
    character_id: string;
    character_name: string;
    costume_name: string | null;
    status: string;
    episode_ids: string[];
  }>;
  activeEpisodes: EpisodeCardData[];
  archivedEpisodes: EpisodeCardData[];
  chatMessages: ChatMessageData[];
  showOnboardingPlanEpisode?: boolean;
  keyArtUrl?: string | null;
  keyArtPickableIngredients?: IngredientCardData[];
  screenplay?: ScreenplayCardData | null;
  screenplayDigest?: string | null;
  screenplayId?: string | null;
}

export function SeriesWorkspace({
  series,
  stats,
  counts,
  ingredients,
  costumesByCharacter,
  sheetsByCharacter,
  episodes,
  characterSheets,
  activeEpisodes,
  archivedEpisodes,
  chatMessages,
  showOnboardingPlanEpisode = false,
  keyArtUrl = null,
  keyArtPickableIngredients = [],
  screenplay = null,
  screenplayDigest = null,
  screenplayId = null,
}: SeriesWorkspaceProps) {
  const [view, setView] = useState<"classic" | "studio">("classic");
  const [tab, setTab] = useState<Tab>(showOnboardingPlanEpisode ? "episodes" : "ingredients");
  const [libraryHighlight, setLibraryHighlight] = useState<LibraryHighlight>(null);
  const { outputItems, handleOutputEvent, handleItemsUpdate } = useSeriesStudioOutput();

  const mentionIngredients = useMemo(
    () =>
      ingredients.map((i) => ({
        id: i.id,
        ref_tag: i.ref_tag,
        name: i.name,
        generation_status: i.generationStatus ?? undefined,
      })),
    [ingredients],
  );

  const copilotRegistration = useMemo(() => {
    const viewLabel = view === "studio" ? "Studio output" : TAB_LABELS[tab];
    const suggestions = [];
    if (showOnboardingPlanEpisode) {
      suggestions.push({
        id: "onboarding-first-episode",
        message: "New here? Ask me to help plan your first episode — or use Show me how in the guide above.",
      });
    }
    if (tab === "memory" && series.memory_markdown.trim().length < 120) {
      suggestions.push({
        id: "memory-sparse",
        message: "Series Memory is still light — add world rules and character canon as you decide them.",
      });
    }
    if (tab === "brief" && series.brief_markdown.trim().length < 80) {
      suggestions.push({
        id: "brief-empty",
        message: "A short series brief helps the co-pilot match tone and format across episodes.",
      });
    }
    if (stats.episodeCount > 0 && stats.episodeCount < 3) {
      suggestions.push({
        id: "episode-arc",
        message: "Early episodes set audience expectations — consider a stronger midpoint hook.",
      });
    }

    return {
      scopeType: "series" as const,
      scopeId: series.id,
      context: {
        seriesId: series.id,
        seriesTitle: series.title,
        defaultOrientation: series.default_orientation,
        briefMarkdown: series.brief_markdown,
        seriesMemoryMarkdown: series.memory_markdown,
        ingredients: ingredients.map((i) => ({
          id: i.id,
          ref_tag: i.ref_tag,
          name: i.name,
          kind: i.kind,
          character_id: i.characterId,
          generation_status: i.generationStatus ?? undefined,
        })),
        characterSheets,
        workspace: {
          view: view === "studio" ? "studio-output" : tab,
          viewLabel,
        },
        screenplayId: screenplayId ?? undefined,
        screenplayDigest: screenplayDigest ?? undefined,
      },
      ingredients: mentionIngredients,
      initialMessages: chatMessages,
      suggestions,
      onOutputEvent: view === "studio" ? handleOutputEvent : undefined,
    };
  }, [
    view,
    tab,
    series.id,
    series.title,
    series.default_orientation,
    series.brief_markdown,
    series.memory_markdown,
    ingredients,
    characterSheets,
    chatMessages,
    mentionIngredients,
    stats.episodeCount,
    showOnboardingPlanEpisode,
    handleOutputEvent,
    screenplayId,
    screenplayDigest,
  ]);

  useRegisterCopilotContext(copilotRegistration);

  function handleOpenInLibrary(item: CopilotOutputItem) {
    setView("classic");
    setTab("ingredients");
    setLibraryHighlight({
      type: item.type === "sheet" ? "sheet" : "ingredient",
      id: item.id,
    });
  }

  return (
    <section className="space-y-10">
      <header className="border-b border-border pb-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-4">
            <StatusDot
              variant={series.status as StatusVariant}
              label={statusLabels[series.status]}
            />
            <h1 className="font-display text-4xl tracking-tight text-foreground">
              {series.title}
            </h1>
            <p className="font-mono text-sm text-muted">/{series.slug}</p>
          </div>
          <div className="flex flex-col items-end gap-4">
            <ViewToggle value={view} onChange={setView} />
            <OrientationToggle seriesId={series.id} value={series.default_orientation} />
          </div>
        </div>
        <div className="mt-10 space-y-6">
          <StatTiles
            episodeCount={stats.episodeCount}
            characterCount={counts.characters}
            locationCount={counts.locations}
            voiceCount={counts.voices}
          />
          <KeyArtSection
            seriesId={series.id}
            keyArtUrl={keyArtUrl}
            pickableIngredients={keyArtPickableIngredients}
          />
          <ScreenplaySection seriesId={series.id} screenplay={screenplay} />
        </div>
      </header>

      {view === "studio" ? (
        <SeriesStudioOutputPanel
          seriesId={series.id}
          items={outputItems}
          onOpenInLibrary={handleOpenInLibrary}
          onItemsUpdate={handleItemsUpdate}
        />
      ) : (
        <>
          <nav className="flex gap-1 border-b border-border">
            {(
              [
                ["ingredients", "Ingredients"],
                ["episodes", "Episodes"],
                ["brief", "Series Brief"],
                ["memory", "Memory"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`border-b-2 px-4 py-2 text-sm transition-colors ${
                  tab === key
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {tab === "ingredients" ? (
            <div className="space-y-6">
              <SeriesReferenceStylePanel
                seriesId={series.id}
                initialReferenceStyle={series.reference_style ?? null}
                restyleCascade={series.restyle_cascade ?? null}
                characterCount={counts.characters}
              />
              <IngredientsSection
                seriesId={series.id}
                ingredients={ingredients}
                counts={counts}
                costumesByCharacter={costumesByCharacter}
                sheetsByCharacter={sheetsByCharacter}
                episodes={episodes}
                highlightTarget={libraryHighlight}
                onHighlightConsumed={() => setLibraryHighlight(null)}
              />
            </div>
          ) : null}

          {tab === "episodes" ? (
            <EpisodesSection
              seriesId={series.id}
              activeEpisodes={activeEpisodes}
              archivedEpisodes={archivedEpisodes}
              showOnboarding={showOnboardingPlanEpisode}
            />
          ) : null}

          {tab === "brief" ? (
            <SeriesBriefEditor
              seriesId={series.id}
              initialMarkdown={series.brief_markdown}
            />
          ) : null}

          {tab === "memory" ? (
            <SeriesMemoryEditor
              seriesId={series.id}
              initialMarkdown={series.memory_markdown}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
