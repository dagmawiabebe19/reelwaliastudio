import type { ScreenplaySceneRow, ScreenplaySummary } from "@/lib/db/screenplays";

export type ScreenplayDigest = {
  screenplayId: string;
  title: string;
  sceneCount: number;
  sceneIndex: Array<{
    sort_order: number;
    scene_number: number;
    slugline: string;
    synopsis: string | null;
    characters: string[];
    location: string;
  }>;
  characters: string[];
  locations: string[];
};

export function buildScreenplayDigest(input: {
  screenplay: Pick<ScreenplaySummary, "id" | "title" | "scene_count">;
  scenes: ScreenplaySceneRow[];
}): ScreenplayDigest {
  const characterSet = new Set<string>();
  const locationSet = new Set<string>();

  for (const scene of input.scenes) {
    for (const name of scene.characters) characterSet.add(name);
    if (scene.location) locationSet.add(scene.location);
  }

  return {
    screenplayId: input.screenplay.id,
    title: input.screenplay.title,
    sceneCount: input.screenplay.scene_count,
    sceneIndex: input.scenes.map((scene) => ({
      sort_order: scene.sort_order,
      scene_number: scene.scene_number,
      slugline: scene.slugline,
      synopsis: scene.synopsis,
      characters: scene.characters,
      location: scene.location,
    })),
    characters: [...characterSet].sort(),
    locations: [...locationSet].sort(),
  };
}

export function formatScreenplayDigestForCopilot(digest: ScreenplayDigest): string {
  const lines = digest.sceneIndex.map((scene) => {
    const synopsis = scene.synopsis?.trim() || "(no synopsis yet)";
    return `${scene.sort_order}. ${scene.slugline} — ${synopsis}`;
  });

  return `Screenplay: ${digest.title} (${digest.screenplayId})
Scenes: ${digest.sceneCount}
Characters: ${digest.characters.join(", ") || "(none)"}
Locations: ${digest.locations.join(", ") || "(none)"}

Scene index (synopsis only — use get_screenplay_scenes for full text):
${lines.join("\n")}`;
}
