import "server-only";

import { getEpisode, listPriorEpisodeSummaries } from "@/lib/db/episodes";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { getScene, listScenesByEpisode } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import { listTakesByScene } from "@/lib/db/takes";
import { buildCopilotCharacterSheets } from "@/lib/production/library-data";
import type { CopilotWorkspaceView } from "@/lib/copilot/workspace-types";
import type { CopilotContext } from "@/lib/ai/copilot/tools";
import { PRIOR_EPISODE_SUMMARY_LIMIT } from "@/lib/ai/copilot/episode-summary";
import { listScreenplayScenes, queryScreenplayBySeries } from "@/lib/db/screenplays";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { buildScreenplayDigest, formatScreenplayDigestForCopilot } from "@/lib/screenplay/digest";

export async function buildCopilotContextSnapshot(input: {
  seriesId: string;
  episodeId?: string;
  sceneId?: string;
  workspace?: CopilotWorkspaceView;
}): Promise<CopilotContext> {
  const series = await getSeries(input.seriesId);
  if (!series) throw new Error("Series not found.");

  try {
    await verifySeriesOwnership(input.seriesId);
  } catch {
    throw new Error("Series not found.");
  }

  const [ingredientsRaw, sheetsRaw, episode, scenes, screenplayRow] = await Promise.all([
    listIngredientsBySeries(input.seriesId),
    listCharacterSheetsBySeries(input.seriesId),
    input.episodeId ? getEpisode(input.episodeId) : Promise.resolve(null),
    input.episodeId ? listScenesByEpisode(input.episodeId) : Promise.resolve([]),
    queryScreenplayBySeries(input.seriesId).catch(() => null),
  ]);

  const characterSheets = await buildCopilotCharacterSheets(sheetsRaw);

  let screenplayId: string | undefined;
  let screenplayDigest: string | undefined;
  if (screenplayRow?.status === "parsed") {
    const screenplayScenes = await listScreenplayScenes(screenplayRow.id);
    if (screenplayScenes.length > 0) {
      screenplayId = screenplayRow.id;
      screenplayDigest = formatScreenplayDigestForCopilot(
        buildScreenplayDigest({ screenplay: screenplayRow, scenes: screenplayScenes }),
      );
    }
  }

  const priorEpisodeSummaries =
    episode && episode.sort_order > 0
      ? await listPriorEpisodeSummaries(
          input.seriesId,
          episode.sort_order,
          PRIOR_EPISODE_SUMMARY_LIMIT,
        )
      : [];

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
    priorEpisodeSummaries,
    workspace,
    scenes: scenes.map((s) => ({
      id: s.id,
      title: s.title,
      prompt: s.prompt,
      act_label: s.act_label,
      shot_intent: s.shot_intent,
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
    screenplayId,
    screenplayDigest,
  };
}
