import { notFound } from "next/navigation";
import { EpisodeStudioPage } from "@/components/series/EpisodeStudioPage";
import { getPublicModelCatalog } from "@/lib/ai/registry";
import { listAudioLinesByEpisode } from "@/lib/db/audio-lines";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { getEpisode } from "@/lib/db/episodes";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { listScenesByEpisode } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import { listTakesForScenes } from "@/lib/db/takes";
import { buildMentionSheets } from "@/lib/production/library-data";
import { resolveAssetUrl, resolveAssetUrls } from "@/lib/storage/resolve-urls";

interface EpisodeStoryboardPageProps {
  params: Promise<{ id: string; episodeId: string }>;
}

export default async function EpisodeStoryboardPage({ params }: EpisodeStoryboardPageProps) {
  const { id: seriesId, episodeId } = await params;

  const [series, episode, scenes, ingredients, audioLinesRaw, chatSession, sheetsRaw] = await Promise.all([
    getSeries(seriesId),
    getEpisode(episodeId),
    listScenesByEpisode(episodeId),
    listIngredientsBySeries(seriesId),
    listAudioLinesByEpisode(episodeId),
    getOrCreateChatSession("episode", episodeId),
    listCharacterSheetsBySeries(seriesId),
  ]);

  if (!series || !episode || episode.series_id !== seriesId) notFound();

  const [audioLines, takes, chatMessages] = await Promise.all([
    resolveAssetUrls(audioLinesRaw),
    listTakesForScenes(scenes.map((s) => s.id)),
    listChatMessages(chatSession.id),
  ]);

  const mentionIngredients = ingredients.map((i) => ({
    id: i.id,
    ref_tag: i.ref_tag,
    name: i.name,
    kind: i.kind,
    character_id: i.character_id,
    generation_status: i.generation_status,
  }));

  const sheets = buildMentionSheets(sheetsRaw);
  const characterSheets = sheetsRaw.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    character_id: sheet.character_id,
    character_name: sheet.character?.name ?? "Character",
    costume_name: sheet.costume?.name ?? null,
    status: sheet.status,
    episode_ids: sheet.episode_ids,
  }));

  const takesByScene: Record<string, (typeof takes)[number][]> = {};
  for (const take of takes) {
    if (!takesByScene[take.scene_id]) takesByScene[take.scene_id] = [];
    takesByScene[take.scene_id].push(take);
  }

  const takesEnriched: Record<
    string,
    Array<{
      id: string;
      take_number: number;
      media_type: "image" | "video";
      starred: boolean;
      status: string;
      error_message: string | null;
      assetUrl: string | null;
      model: string | null;
    }>
  > = {};

  for (const [sceneId, sceneTakes] of Object.entries(takesByScene)) {
    takesEnriched[sceneId] = await Promise.all(
      sceneTakes.map(async (take) => ({
        id: take.id,
        take_number: take.take_number,
        media_type: take.media_type,
        starred: take.starred,
        status: take.status,
        error_message: take.error_message,
        assetUrl: await resolveAssetUrl(take.assets),
        model: take.model,
      })),
    );
  }

  const models = getPublicModelCatalog();

  return (
    <EpisodeStudioPage
      seriesId={seriesId}
      episodeId={episodeId}
      seriesTitle={series.title}
      episodeTitle={episode.title}
      defaultOrientation={series.default_orientation}
      briefMarkdown={series.brief_markdown}
      seriesMemoryMarkdown={series.memory_markdown}
      scenes={scenes}
      ingredients={mentionIngredients}
      sheets={sheets}
      characterSheets={characterSheets}
      models={models}
      takesByScene={takesEnriched}
      chatMessages={chatMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_name: m.tool_name,
        tool_args: m.tool_args as Record<string, unknown> | null,
        tool_result: m.tool_result as Record<string, unknown> | null,
      }))}
      audioLines={audioLines.map((line) => ({
        id: line.id,
        title: line.title,
        description: line.description,
        ref_tag: line.ref_tag,
        assetUrl: line.assetUrl,
        assetId: line.asset_id,
      }))}
    />
  );
}
