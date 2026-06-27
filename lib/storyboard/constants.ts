import type { Scene } from "@/lib/db/types";

export const ACT_GROUPS = ["EP_01", "EP_02", "EP_03", "Storyboard-only"] as const;

export type SceneWithBindings = Scene & {
  scene_ingredients: {
    ingredient_id: string;
    role: string;
    ingredients: { id: string; ref_tag: string; name: string; kind: string } | null;
  }[];
};

export type SceneGroup = (typeof ACT_GROUPS)[number] | "Archive";
