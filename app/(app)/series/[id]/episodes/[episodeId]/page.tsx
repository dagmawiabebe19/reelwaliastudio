import Link from "next/link";
import { notFound } from "next/navigation";
import { AudioLinesPanel } from "@/components/series/audio/AudioLinesPanel";
import { StoryboardWorkspace } from "@/components/series/storyboard/StoryboardWorkspace";
import { listAudioLinesByEpisode } from "@/lib/db/audio-lines";
import { getEpisode } from "@/lib/db/episodes";
import { listIngredientsBySeries } from "@/lib/db/ingredients";
import { listScenesByEpisode } from "@/lib/db/scenes";
import { getSeries } from "@/lib/db/series";
import { resolveAssetUrls } from "@/lib/storage/resolve-urls";

interface EpisodeStoryboardPageProps {
  params: Promise<{ id: string; episodeId: string }>;
}

export default async function EpisodeStoryboardPage({ params }: EpisodeStoryboardPageProps) {
  const { id: seriesId, episodeId } = await params;

  const [series, episode, scenes, ingredients, audioLinesRaw] = await Promise.all([
    getSeries(seriesId),
    getEpisode(episodeId),
    listScenesByEpisode(episodeId),
    listIngredientsBySeries(seriesId),
    listAudioLinesByEpisode(episodeId),
  ]);

  if (!series || !episode || episode.series_id !== seriesId) notFound();

  const audioLines = await resolveAssetUrls(audioLinesRaw);
  const mentionIngredients = ingredients.map((i) => ({
    id: i.id,
    ref_tag: i.ref_tag,
    name: i.name,
  }));

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

      <StoryboardWorkspace
        seriesId={seriesId}
        episodeId={episodeId}
        defaultOrientation={series.default_orientation}
        scenes={scenes}
        ingredients={mentionIngredients}
      />
    </section>
  );
}
