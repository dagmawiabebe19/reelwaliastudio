"use client";

import { useState } from "react";
import { ViewToggle } from "@/components/series/ViewToggle";
import { StudioShell } from "@/components/series/StudioShell";
import { StoryboardWorkspace } from "@/components/series/storyboard/StoryboardWorkspace";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";
import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";
import type { MentionSheet } from "@/lib/production/types";
import type { Orientation } from "@/lib/db/types";
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
  seriesTitle: string;
  defaultOrientation: Orientation;
  briefMarkdown: string;
  scenes: SceneWithBindings[];
  ingredients: MentionIngredient[];
  sheets: MentionSheet[];
  characterSheets: CharacterSheetCopilotData[];
  models: ModelCatalogEntry[];
  takesByScene: Record<string, TakeCardData[]>;
  chatMessages: ChatMessageData[];
}

export function EpisodeWorkspace(props: EpisodeWorkspaceProps) {
  const [view, setView] = useState<"classic" | "studio">("classic");

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === "studio" ? (
        <StudioShell
          {...props}
          scopeType="episode"
          scopeId={props.episodeId}
        />
      ) : (
        <StoryboardWorkspace
          seriesId={props.seriesId}
          episodeId={props.episodeId}
          defaultOrientation={props.defaultOrientation}
          scenes={props.scenes}
          ingredients={props.ingredients}
          sheets={props.sheets}
          models={props.models}
          takesByScene={props.takesByScene}
        />
      )}
    </div>
  );
}
