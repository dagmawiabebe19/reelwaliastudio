"use client";

import { useState } from "react";
import { AudioLinesPanel, type AudioLineCardData } from "@/components/series/audio/AudioLinesPanel";
import { EpisodeStudioChrome } from "@/components/series/EpisodeStudioChrome";
import { EpisodeWorkspace } from "@/components/series/EpisodeWorkspace";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import type {
  CharacterSheetCardData,
  IngredientCardData,
  MentionSheet,
} from "@/lib/production/types";
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
  seedanceConfigured: boolean;
  takesByScene: Record<string, TakeCardData[]>;
  chatMessages: ChatMessageData[];
  audioLines: AudioLineCardData[];
  libraryIngredients: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  showOnboardingSegments?: boolean;
}

export function EpisodeStudioPage(props: EpisodeStudioPageProps) {
  const [showAudio, setShowAudio] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EpisodeStudioChrome
        seriesId={props.seriesId}
        seriesTitle={props.seriesTitle}
        episodeId={props.episodeId}
        episodes={props.episodes}
        audioLineCount={props.audioLines.length}
        showAudio={showAudio}
        onToggleAudio={() => setShowAudio((v) => !v)}
        showIngredients={showIngredients}
        onToggleIngredients={() => setShowIngredients((v) => !v)}
        ingredientCount={props.libraryIngredients.length}
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EpisodeWorkspace
          {...props}
          showIngredients={showIngredients}
          onCloseIngredients={() => setShowIngredients(false)}
        />
      </div>
    </div>
  );
}
