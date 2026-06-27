import Link from "next/link";
import { notFound } from "next/navigation";
import { AudioLinesPanel } from "@/components/series/audio/AudioLinesPanel";
import { EpisodeWorkspace } from "@/components/series/EpisodeWorkspace";
import { EpisodeFilmExportButton } from "@/components/series/export/EpisodeFilmExportButton";
import { getPublicModelCatalog } from "@/lib/ai/registry";
import { listAudioLinesByEpisode } from "@/lib/db/audio-lines";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { getEpisode } from "@/lib/db/episodes";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { listScenesByEpisode } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import { listTakesForScenes } from "@/lib/db/takes";
import { resolveAssetUrl, resolveAssetUrls } from "@/lib/storage/resolve-urls";

interface EpisodeStoryboardPageProps {
  params: Promise<{ id: string; episodeId: string }>;
}

export default async function EpisodeStoryboardPage({ params }: EpisodeStoryboardPageProps) {
  const { id: seriesId, episodeId } = await params;

  const [series, episode, scenes, ingredients, audioLinesRaw, chatSession] = await Promise.all([
    getSeries(seriesId),
    getEpisode(episodeId),
    listScenesByEpisode(episodeId),
    listIngredientsBySeries(seriesId),
    listAudioLinesByEpisode(episodeId),
    getOrCreateChatSession("episode", episodeId),
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
    <section className="space-y-10">
      <header className="border-b border-border pb-6">
        <Link href={`/series/${seriesId}`} className="link-muted text-sm">
          ← {series.title}
        </Link>
        <h1 className="mt-4 font-display text-3xl text-foreground">{episode.title}</h1>
        {episode.logline ? (
          <p className="mt-2 text-sm text-muted">{episode.logline}</p>
        ) : null}
      </header>

      <AudioLinesPanel
        seriesId={seriesId}
        episodeId={episodeId}
        lines={audioLines.map((line) => ({
          id: line.id,
          title: line.title,
          description: line.description,
          ref_tag: line.ref_tag,
          assetUrl: line.assetUrl,
          assetId: line.asset_id,
        }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <h2 className="font-display text-lg text-foreground">Episode Film</h2>
          <p className="text-sm text-muted">
            Concatenate starred takes into one film (orientation-aware).
          </p>
        </div>
        <EpisodeFilmExportButton episodeId={episodeId} seriesId={seriesId} />
      </div>

      <EpisodeWorkspace
        seriesId={seriesId}
        episodeId={episodeId}
        seriesTitle={series.title}
        defaultOrientation={series.default_orientation}
        briefMarkdown={series.brief_markdown}
        scenes={scenes}
        ingredients={mentionIngredients}
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
      />
    </section>
  );
}
