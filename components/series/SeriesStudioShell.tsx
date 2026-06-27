"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { CopilotPane, type ChatMessageData } from "@/components/series/copilot/CopilotPane";
import { CopilotOutputPreview } from "@/components/series/copilot/CopilotOutputPreview";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import type { CopilotOutputItem } from "@/lib/copilot/output";
import { applyCopilotOutputEvent } from "@/lib/copilot/output-state";
import type { CopilotOutputEvent } from "@/lib/copilot/output";

interface SeriesStudioShellProps {
  seriesId: string;
  seriesTitle: string;
  defaultOrientation: string;
  briefMarkdown: string;
  ingredients: Array<{
    id: string;
    ref_tag: string;
    name: string;
    kind?: string;
    character_id?: string | null;
    generation_status?: string;
  }>;
  characterSheets?: Array<{
    id: string;
    name: string;
    character_id: string;
    character_name: string;
    costume_name: string | null;
    status: string;
    episode_ids: string[];
  }>;
  models: ModelCatalogEntry[];
  chatMessages: ChatMessageData[];
  onOpenInLibrary: (item: CopilotOutputItem) => void;
}

export function SeriesStudioShell({
  seriesId,
  seriesTitle,
  defaultOrientation,
  briefMarkdown,
  ingredients,
  characterSheets,
  models,
  chatMessages,
  onOpenInLibrary,
}: SeriesStudioShellProps) {
  const [outputItems, setOutputItems] = useState<CopilotOutputItem[]>([]);

  const handleOutputEvent = useCallback((event: CopilotOutputEvent) => {
    setOutputItems((prev) => applyCopilotOutputEvent(prev, event));
  }, []);

  const handleItemsUpdate = useCallback(
    (updater: (prev: CopilotOutputItem[]) => CopilotOutputItem[]) => {
      setOutputItems(updater);
    },
    [],
  );

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
              kind: i.kind ?? "reference",
              character_id: i.character_id,
              generation_status: i.generation_status,
            })),
            characterSheets,
          }}
          imageModels={models.filter((m) => m.kind === "image")}
          ingredients={ingredients}
          initialMessages={chatMessages}
          onOutputEvent={handleOutputEvent}
        />
      </div>
      <div className="flex min-h-0 flex-col p-4">
        <CopilotOutputPreview
          seriesId={seriesId}
          items={outputItems}
          onOpenInLibrary={onOpenInLibrary}
          onItemsUpdate={handleItemsUpdate}
        />
        <Link
          href={`/series/${seriesId}`}
          className="mt-4 text-center text-sm text-accent hover:underline"
        >
          ← Back to episodes
        </Link>
      </div>
    </div>
  );
}
