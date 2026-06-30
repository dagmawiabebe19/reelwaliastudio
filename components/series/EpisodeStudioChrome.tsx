"use client";

import Link from "next/link";
import {
  BookMarked,
  ChevronLeft,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Volume2,
} from "lucide-react";
import { BrandWordmark } from "@/components/brand/BrandWordmark";
import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";
import { EpisodeFilmExportButton } from "@/components/series/export/EpisodeFilmExportButton";
import { useStudioNav } from "@/components/sidebar/studio-nav-context";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

interface EpisodeStudioChromeProps {
  seriesId: string;
  seriesTitle: string;
  episodeId: string;
  episodeTitle: string;
  audioLineCount: number;
  showAudio: boolean;
  onToggleAudio: () => void;
  showIngredients: boolean;
  onToggleIngredients: () => void;
  ingredientCount: number;
}

export function EpisodeStudioChrome({
  seriesId,
  seriesTitle,
  episodeId,
  episodeTitle,
  audioLineCount,
  showAudio,
  onToggleAudio,
  showIngredients,
  onToggleIngredients,
  ingredientCount,
}: EpisodeStudioChromeProps) {
  const { openNav } = useStudioNav();
  const { toggleCollapsed, prefs } = useCopilotWorkspace();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 shadow-[inset_0_-1px_0_var(--border-subtle)]">
      <BrandWordmark size="compact" className="mr-1" />

      <div className="studio-toolbar shrink-0">
        <button type="button" onClick={openNav} className="studio-toolbar-btn">
          <Menu className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          Menu
        </button>
        <span className="studio-toolbar-divider" aria-hidden />
        <Link
          href={`/series/${seriesId}`}
          className="studio-toolbar-btn max-w-[8rem] truncate"
          title={seriesTitle}
        >
          <ChevronLeft className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          <span className="truncate">{seriesTitle}</span>
        </Link>
      </div>

      <div className="min-w-0 flex-1 text-center">
        <p className="studio-column-heading-sm truncate font-display text-foreground" title={episodeTitle}>
          {episodeTitle}
        </p>
      </div>

      <div className="studio-toolbar shrink-0">
        <button
          type="button"
          onClick={onToggleIngredients}
          className={`studio-toolbar-btn ${showIngredients ? "studio-toolbar-btn--active" : ""}`}
        >
          <BookMarked className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          References{ingredientCount > 0 ? ` (${ingredientCount})` : ""}
        </button>
        <button
          type="button"
          onClick={onToggleAudio}
          className={`studio-toolbar-btn ${showAudio ? "studio-toolbar-btn--active" : ""}`}
        >
          <Volume2 className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          Audio{audioLineCount > 0 ? ` (${audioLineCount})` : ""}
        </button>
        <EpisodeFilmExportButton episodeId={episodeId} seriesId={seriesId} compact />
        <span className="studio-toolbar-divider" aria-hidden />
        <button type="button" onClick={toggleCollapsed} className="studio-toolbar-btn">
          {prefs.collapsed ? (
            <PanelRightOpen className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          ) : (
            <PanelRightClose className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
          )}
          {prefs.collapsed ? "Show co-pilot" : "Hide co-pilot"}
        </button>
      </div>
    </header>
  );
}
