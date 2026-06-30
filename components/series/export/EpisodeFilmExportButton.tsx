"use client";

import { useTransition } from "react";
import { Clapperboard } from "lucide-react";
import { exportEpisodeFilmAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/export-actions";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

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
          ? `studio-toolbar-btn ${pending ? "opacity-50" : ""}`
          : "studio-btn studio-btn-primary disabled:opacity-50"
      }
    >
      {compact ? (
        <>
          <Clapperboard className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          {pending ? "Exporting…" : "Film"}
        </>
      ) : (
        (pending ? "Exporting…" : "Export starred takes film")
      )}
    </button>
  );
}
