export type ScreenplayProposalCharacter = {
  key: string;
  name: string;
  appearance: string;
  sceneCount: number;
};

export type ScreenplayProposalLocation = {
  key: string;
  name: string;
  description: string;
};

export type ScreenplayProposalEpisode = {
  key: string;
  title: string;
  logline: string;
  sceneSortOrders: number[];
  hook?: string;
  cliffhanger?: string;
  isPaywall?: boolean;
};

export type ScreenplayBreakdownProposal = {
  toneNotes: string;
  characters: ScreenplayProposalCharacter[];
  locations: ScreenplayProposalLocation[];
  structures: {
    faithful: {
      label: string;
      episodes: ScreenplayProposalEpisode[];
    };
    vertical: {
      label: string;
      episodes: ScreenplayProposalEpisode[];
      paywallEpisodeKey: string | null;
    };
  };
};

export type ScreenplayAnalysisStatus = "analyzing" | "proposed" | "failed" | "approved";

export type MapChunkSceneResult = {
  sort_order: number;
  synopsis: string;
  character_notes: Array<{ name: string; appearance: string }>;
  location_notes: Array<{ name: string; description: string }>;
  prop_mentions: string[];
};

export type MapChunkResult = {
  scenes: MapChunkSceneResult[];
};
