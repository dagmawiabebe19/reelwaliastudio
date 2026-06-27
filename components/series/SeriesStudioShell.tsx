"use client";

import Link from "next/link";
import { CopilotPane, type ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";

interface SeriesStudioShellProps {
  seriesId: string;
  seriesTitle: string;
  defaultOrientation: string;
  briefMarkdown: string;
  ingredients: MentionIngredient[];
  models: ModelCatalogEntry[];
  chatMessages: ChatMessageData[];
}

export function SeriesStudioShell({
  seriesId,
  seriesTitle,
  defaultOrientation,
  briefMarkdown,
  ingredients,
  models,
  chatMessages,
}: SeriesStudioShellProps) {
  return (
    <div className="grid h-[calc(100vh-12rem)] grid-cols-2 gap-4 rounded-lg border border-border bg-surface">
      <div className="flex min-h-0 flex-col border-r border-border p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Co-pilot</p>
        <CopilotPane
          scopeType="series"
          scopeId={seriesId}
          context={{
            seriesId,
            seriesTitle,
            defaultOrientation,
            briefMarkdown,
            ingredients: ingredients.map((i) => ({
              id: i.id,
              ref_tag: i.ref_tag,
              name: i.name,
              kind: "reference",
            })),
          }}
          imageModels={models.filter((m) => m.kind === "image")}
          ingredients={ingredients}
          initialMessages={chatMessages}
        />
      </div>
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <p className="font-display text-xl text-foreground">Open an episode for generation</p>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Scene takes and multi-model generation live on the episode storyboard. Switch to Studio view
          on any episode page.
        </p>
        <Link
          href={`/series/${seriesId}`}
          className="mt-6 text-sm text-accent hover:underline"
        >
          ← Back to episodes
        </Link>
      </div>
    </div>
  );
}
