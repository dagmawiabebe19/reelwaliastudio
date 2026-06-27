"use client";

import { useState } from "react";
import { OrientationToggle } from "@/components/series/OrientationToggle";
import { SeriesBriefEditor } from "@/components/series/SeriesBriefEditor";
import { StatTiles } from "@/components/series/StatTiles";
import { StatusDot, type StatusVariant } from "@/components/ui/StatusDot";
import { ViewToggle } from "@/components/series/ViewToggle";
import { SeriesStudioShell } from "@/components/series/SeriesStudioShell";
import {
  IngredientsSection,
  type IngredientCardData,
} from "@/components/series/ingredients/IngredientsSection";
import {
  EpisodesSection,
  type EpisodeCardData,
} from "@/components/series/episodes/EpisodesSection";
import type { Orientation, SeriesStatus } from "@/lib/db/types";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";

type Tab = "ingredients" | "episodes" | "brief";

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
  };
  stats: {
    episodeCount: number;
    ingredientCount: number;
    runtimeSeconds: number | null;
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
  activeEpisodes: EpisodeCardData[];
  archivedEpisodes: EpisodeCardData[];
  models: ModelCatalogEntry[];
  chatMessages: ChatMessageData[];
}

export function SeriesWorkspace({
  series,
  stats,
  counts,
  ingredients,
  activeEpisodes,
  archivedEpisodes,
  models,
  chatMessages,
}: SeriesWorkspaceProps) {
  const [view, setView] = useState<"classic" | "studio">("classic");
  const [tab, setTab] = useState<Tab>("ingredients");

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
        <div className="mt-10">
          <StatTiles
            episodeCount={stats.episodeCount}
            ingredientCount={stats.ingredientCount}
            runtimeSeconds={stats.runtimeSeconds}
          />
        </div>
      </header>

      {view === "studio" ? (
        <SeriesStudioShell
          seriesId={series.id}
          seriesTitle={series.title}
          defaultOrientation={series.default_orientation}
          briefMarkdown={series.brief_markdown}
          ingredients={ingredients.map((i) => ({
            id: i.id,
            ref_tag: i.ref_tag,
            name: i.name,
          }))}
          models={models}
          chatMessages={chatMessages}
        />
      ) : (
        <>
          <nav className="flex gap-1 border-b border-border">
            {(
              [
                ["ingredients", "Ingredients"],
                ["episodes", "Episodes"],
                ["brief", "Series Brief"],
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
            <IngredientsSection
              seriesId={series.id}
              ingredients={ingredients}
              counts={counts}
            />
          ) : null}

          {tab === "episodes" ? (
            <EpisodesSection
              seriesId={series.id}
              activeEpisodes={activeEpisodes}
              archivedEpisodes={archivedEpisodes}
            />
          ) : null}

          {tab === "brief" ? (
            <SeriesBriefEditor
              seriesId={series.id}
              initialMarkdown={series.brief_markdown}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
