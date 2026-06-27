"use client";

import { useCallback, useState } from "react";
import { CopilotOutputPreview } from "@/components/series/copilot/CopilotOutputPreview";
import type { CopilotOutputItem } from "@/lib/copilot/output";
import { applyCopilotOutputEvent } from "@/lib/copilot/output-state";
import type { CopilotOutputEvent } from "@/lib/copilot/output";

interface SeriesStudioOutputPanelProps {
  seriesId: string;
  onOpenInLibrary: (item: CopilotOutputItem) => void;
  items: CopilotOutputItem[];
  onItemsUpdate: (updater: (prev: CopilotOutputItem[]) => CopilotOutputItem[]) => void;
}

export function SeriesStudioOutputPanel({
  seriesId,
  onOpenInLibrary,
  items,
  onItemsUpdate,
}: SeriesStudioOutputPanelProps) {
  return (
    <div className="min-h-[28rem] rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Co-pilot output
      </p>
      <CopilotOutputPreview
        seriesId={seriesId}
        items={items}
        onOpenInLibrary={onOpenInLibrary}
        onItemsUpdate={onItemsUpdate}
      />
    </div>
  );
}

export function useSeriesStudioOutput() {
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

  return { outputItems, handleOutputEvent, handleItemsUpdate };
}
