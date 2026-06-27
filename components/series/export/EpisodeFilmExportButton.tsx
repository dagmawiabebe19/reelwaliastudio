"use client";

import { useTransition } from "react";
import { exportEpisodeFilmAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/export-actions";

export function EpisodeFilmExportButton({
  episodeId,
  seriesId,
  compact = false,
}: {
  episodeId: string;
  seriesId: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await exportEpisodeFilmAction(episodeId, seriesId);
          if ("error" in result && result.error) alert(result.error);
          else alert("Film export started. Check back shortly for download link.");
        });
      }}
      className={
        compact
          ? "rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
          : "rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      }
    >
      {pending ? "Exporting…" : compact ? "Film" : "Export starred takes film"}
    </button>
  );
}
