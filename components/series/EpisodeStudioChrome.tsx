"use client";

import Link from "next/link";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";
import { EpisodeFilmExportButton } from "@/components/series/export/EpisodeFilmExportButton";
import { useStudioNav } from "@/components/sidebar/studio-nav-context";

interface EpisodeStudioChromeProps {
  seriesId: string;
  seriesTitle: string;
  episodeId: string;
  episodeTitle: string;
  audioLineCount: number;
  showAudio: boolean;
  onToggleAudio: () => void;
}

export function EpisodeStudioChrome({
  seriesId,
  seriesTitle,
  episodeId,
  episodeTitle,
  audioLineCount,
  showAudio,
  onToggleAudio,
}: EpisodeStudioChromeProps) {
  const { openNav } = useStudioNav();
  const { toggleCollapsed, prefs } = useCopilotWorkspace();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
      <BrandWordmark size="compact" className="mr-1" />

      <div className="flex shrink-0 items-center gap-1 border-l border-border pl-3">
        <button
          type="button"
          onClick={openNav}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
        >
          Menu
        </button>
        <Link
          href={`/series/${seriesId}`}
          className="max-w-[8rem] truncate rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-accent"
          title={seriesTitle}
        >
          ← {seriesTitle}
        </Link>
      </div>

      <div className="min-w-0 flex-1 text-center">
        <p className="studio-column-heading-sm truncate font-display text-foreground" title={episodeTitle}>
          {episodeTitle}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onToggleAudio}
          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
            showAudio
              ? "border-accent bg-accent-muted text-accent"
              : "border-border text-muted hover:border-accent/50 hover:text-accent"
          }`}
        >
          Audio{audioLineCount > 0 ? ` (${audioLineCount})` : ""}
        </button>
        <EpisodeFilmExportButton episodeId={episodeId} seriesId={seriesId} compact />
        <button
          type="button"
          onClick={toggleCollapsed}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
        >
          {prefs.collapsed ? "Show co-pilot" : "Hide co-pilot"}
        </button>
      </div>
    </header>
  );
}
