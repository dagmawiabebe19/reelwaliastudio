"use client";

import { useTransition } from "react";
import { exportEpisodeFilmAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/export-actions";

export function EpisodeFilmExportButton({
  episodeId,
  seriesId,
}: {
  episodeId: string;
  seriesId: string;
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
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Exporting…" : "Export starred takes film"}
    </button>
  );
}
