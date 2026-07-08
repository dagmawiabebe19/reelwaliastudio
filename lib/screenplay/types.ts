export type ScreenplayFormat = "pdf" | "fdx" | "fountain" | "txt";

export type ScreenplayStatus = "uploaded" | "parsing" | "parsed" | "failed";

export type ParsedScreenplayScene = {
  sceneNumber: number;
  slugline: string;
  location: string;
  intExt: string;
  timeOfDay: string;
  characters: string[];
  fullText: string;
  sortOrder: number;
};

export type ScreenplayParseResult = {
  scenes: ParsedScreenplayScene[];
  pageCountEst: number | null;
  unrecognizedBlocksPct: number;
  characterNames: string[];
  locationNames: string[];
};

export type ScreenplayParseFailure = {
  reason: string;
};
