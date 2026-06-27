import type { ChatMessageData, CopilotContextPayload, MentionIngredient } from "@/components/series/copilot/CopilotPane";
import type { CopilotOutputEvent } from "@/lib/copilot/output";

export type CopilotDockSide = "left" | "right";
export type CopilotPanelMode = "docked" | "float";

export type CopilotWorkspaceView = {
  /** Machine id, e.g. ingredients | memory | episode-studio */
  view: string;
  /** Human label shown in co-pilot header */
  viewLabel: string;
  episodeTitle?: string;
  sceneTitle?: string;
  scenePrompt?: string | null;
  sceneActLabel?: string | null;
  selectedCharacterName?: string;
  selectedIngredientName?: string;
  activeTakeSummary?: string;
};

export type CopilotSuggestion = {
  id: string;
  message: string;
};

export type CopilotPanelPrefs = {
  collapsed: boolean;
  dock: CopilotDockSide;
  mode: CopilotPanelMode;
  width: number;
  floatX: number;
  floatY: number;
};

export const DEFAULT_COPILOT_PANEL_PREFS: CopilotPanelPrefs = {
  collapsed: false,
  dock: "right",
  mode: "docked",
  width: 380,
  floatX: 24,
  floatY: 80,
};

export type CopilotScopeType = "series" | "episode" | "scene";

export type CopilotRegistration = {
  scopeType: CopilotScopeType;
  scopeId: string;
  context: CopilotContextPayload;
  ingredients: MentionIngredient[];
  initialMessages?: ChatMessageData[];
  suggestions?: CopilotSuggestion[];
  onOutputEvent?: (event: CopilotOutputEvent) => void;
};

export type ParsedStudioRoute = {
  seriesId: string | null;
  episodeId: string | null;
  isEpisodeStudio: boolean;
  isSeriesRoute: boolean;
};
