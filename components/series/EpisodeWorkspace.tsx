"use client";

import { StudioShell } from "@/components/series/StudioShell";
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

interface EpisodeWorkspaceProps {
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
  libraryIngredients: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  showOnboardingSegments?: boolean;
  showIngredients: boolean;
  onCloseIngredients: () => void;
}

export function EpisodeWorkspace(props: EpisodeWorkspaceProps) {
  return <StudioShell {...props} />;
}
