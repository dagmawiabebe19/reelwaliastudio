import type { Scene } from "@/lib/db/types";

export { STORYBOARD_ONLY_LABEL } from "@/lib/storyboard/episode-buckets";

export type SceneWithBindings = Scene & {
  scene_ingredients: {
    ingredient_id: string;
    role: string;
    ingredients: {
      id: string;
      ref_tag: string;
      name: string;
      kind: string;
      primary_asset_id?: string | null;
      generation_status?: string | null;
      assets?: { id: string; bucket: string; storage_path: string; media_type: string } | null;
    } | null;
  }[];
  scene_character_sheets?: {
    character_sheet_id: string;
    role: string;
    character_sheets: {
      id: string;
      name: string;
      character_id: string;
      costume_id: string | null;
      status: string;
      character: { id: string; name: string; ref_tag: string } | null;
      costume: { id: string; name: string; ref_tag: string } | null;
      angles?: Array<{
        angle_label: string;
        asset_id: string;
        assets: { bucket: string; storage_path: string; media_type: string } | null;
      }>;
    } | null;
  }[];
  resolved_references?: Array<{
    type: string;
    id: string;
    label: string;
    ref_tag?: string;
    assetUrls?: string[];
  }>;
  reference_overrides?: Record<string, unknown>;
  displayReferences?: import("@/lib/production/types").ResolvedReference[];
};
