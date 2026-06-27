export type ResolvedReference = {
  type: "character_sheet" | "location" | "voice" | "ingredient";
  id: string;
  label: string;
  ref_tag?: string;
  assetUrls: string[];
};

export type MentionSheet = {
  id: string;
  label: string;
  character_id: string;
  character_name: string;
  costume_name: string | null;
  status: string;
};

export type CharacterSheetCardData = {
  id: string;
  name: string;
  status: string;
  generation_error: string | null;
  character_id: string;
  costume_id: string | null;
  costume_name: string | null;
  episode_ids: string[];
  angleUrls: Record<string, string | null>;
};

export type EpisodeOption = { id: string; title: string };

export type IngredientCardData = {
  id: string;
  kind: import("@/lib/db/types").IngredientKind;
  name: string;
  description: string | null;
  ref_tag: string;
  assetUrl: string | null;
  mediaType: string | null;
  characterId?: string | null;
  generationStatus?: string | null;
  generationError?: string | null;
};
