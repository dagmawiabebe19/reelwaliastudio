import "server-only";

import { getEpisode } from "@/lib/db/episodes";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { getScene, listScenesByEpisode } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import { listTakesByScene } from "@/lib/db/takes";
import { buildCopilotCharacterSheets } from "@/lib/production/library-data";
import type { CopilotWorkspaceView } from "@/lib/copilot/workspace-types";
import type { CopilotContext } from "@/lib/ai/copilot/tools";

export async function buildCopilotContextSnapshot(input: {
  seriesId: string;
  episodeId?: string;
  sceneId?: string;
  workspace?: CopilotWorkspaceView;
}): Promise<CopilotContext> {
  const series = await getSeries(input.seriesId);
  if (!series) throw new Error("Series not found.");

  const [ingredientsRaw, sheetsRaw, episode, scenes] = await Promise.all([
    listIngredientsBySeries(input.seriesId),
    listCharacterSheetsBySeries(input.seriesId),
    input.episodeId ? getEpisode(input.episodeId) : Promise.resolve(null),
    input.episodeId ? listScenesByEpisode(input.episodeId) : Promise.resolve([]),
  ]);

  const characterSheets = await buildCopilotCharacterSheets(sheetsRaw);

  let sceneDetail: Awaited<ReturnType<typeof getScene>> | null = null;
  let activeTakeSummary: string | undefined = input.workspace?.activeTakeSummary;

  if (input.sceneId) {
    sceneDetail = await getScene(input.sceneId);
    if (!activeTakeSummary) {
      const takes = await listTakesByScene(input.sceneId);
      const latest = takes[takes.length - 1];
      if (latest) {
        activeTakeSummary = `Take #${latest.take_number} — ${latest.status}${latest.error_message ? ` (${latest.error_message})` : ""}`;
      }
    }
  }

  const workspace: CopilotWorkspaceView = {
    view: input.workspace?.view ?? (input.episodeId ? "episode-studio" : "series"),
    viewLabel: input.workspace?.viewLabel ?? series.title,
    episodeTitle: input.workspace?.episodeTitle ?? episode?.title,
    sceneTitle: input.workspace?.sceneTitle ?? sceneDetail?.title,
    scenePrompt: input.workspace?.scenePrompt ?? sceneDetail?.prompt,
    sceneActLabel: input.workspace?.sceneActLabel ?? sceneDetail?.act_label,
    selectedCharacterName: input.workspace?.selectedCharacterName,
    selectedIngredientName: input.workspace?.selectedIngredientName,
    activeTakeSummary,
  };

  return {
    seriesId: series.id,
    episodeId: input.episodeId,
    sceneId: input.sceneId,
    seriesTitle: series.title,
    defaultOrientation: series.default_orientation,
    briefMarkdown: series.brief_markdown,
    seriesMemoryMarkdown: series.memory_markdown,
    workspace,
    scenes: scenes.map((s) => ({
      id: s.id,
      title: s.title,
      prompt: s.prompt,
      act_label: s.act_label,
    })),
    ingredients: ingredientsRaw.map((i) => ({
      id: i.id,
      ref_tag: i.ref_tag,
      name: i.name,
      kind: i.kind,
      character_id: i.character_id,
      generation_status: i.generation_status,
    })),
    characterSheets,
  };
}
