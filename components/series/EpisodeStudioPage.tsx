"use client";

import { useState } from "react";
import { AudioLinesPanel, type AudioLineCardData } from "@/components/series/audio/AudioLinesPanel";
import { EpisodeStudioChrome } from "@/components/series/EpisodeStudioChrome";
import { EpisodeWorkspace } from "@/components/series/EpisodeWorkspace";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import type { MentionSheet } from "@/lib/production/types";
import type { Orientation, Episode } from "@/lib/db/types";
import type { SceneWithBindings } from "@/lib/storyboard/constants";

type CharacterSheetCopilotData = {
  id: string;
  name: string;
  character_id: string;
  character_name: string;
  costume_name: string | null;
  status: string;
  episode_ids: string[];
};

interface EpisodeStudioPageProps {
  seriesId: string;
  episodeId: string;
  episodeTitle: string;
  episodes: Episode[];
  seriesTitle: string;
  defaultOrientation: Orientation;
  briefMarkdown: string;
  seriesMemoryMarkdown?: string;
  scenes: SceneWithBindings[];
  ingredients: MentionIngredient[];
  sheets: MentionSheet[];
  characterSheets: CharacterSheetCopilotData[];
  models: ModelCatalogEntry[];
  takesByScene: Record<string, TakeCardData[]>;
  chatMessages: ChatMessageData[];
  audioLines: AudioLineCardData[];
}

export function EpisodeStudioPage(props: EpisodeStudioPageProps) {
  const [showAudio, setShowAudio] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EpisodeStudioChrome
        seriesId={props.seriesId}
        seriesTitle={props.seriesTitle}
        episodeId={props.episodeId}
        episodeTitle={props.episodeTitle}
        audioLineCount={props.audioLines.length}
        showAudio={showAudio}
        onToggleAudio={() => setShowAudio((v) => !v)}
      />

      {showAudio ? (
        <div className="max-h-48 shrink-0 overflow-y-auto border-b border-border bg-surface-elevated/40 px-4 py-3">
          <AudioLinesPanel
            seriesId={props.seriesId}
            episodeId={props.episodeId}
            lines={props.audioLines}
          />
        </div>
      ) : null}

      <EpisodeWorkspace {...props} />
    </div>
  );
}
