import { notFound } from "next/navigation";
import { EpisodeStudioPage } from "@/components/series/EpisodeStudioPage";
import { getSessionUser } from "@/lib/auth/getUser";
import { loadEpisodeStudioPageData } from "@/lib/episode/load-studio-page";
import { shouldShowOnboarding } from "@/lib/onboarding/status";

interface EpisodeStoryboardPageProps {
  params: Promise<{ id: string; episodeId: string }>;
}

export default async function EpisodeStoryboardPage({ params }: EpisodeStoryboardPageProps) {
  const { id: seriesId, episodeId } = await params;

  void import("@/lib/ai/generation/take-reconcile")
    .then(({ scheduleEpisodeStuckTakeReconcile }) => {
      scheduleEpisodeStuckTakeReconcile({ episodeId, seriesId });
    })
    .catch((error) => {
      console.error("[take-reconcile] failed to schedule episode sweep", {
        episodeId,
        seriesId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

  const loaded = await loadEpisodeStudioPageData({ seriesId, episodeId });
  const { series, episode } = loaded;
  if (!series || !episode || episode.series_id !== seriesId) notFound();

  const user = await getSessionUser();
  const showOnboardingSegments = user
    ? await shouldShowOnboarding(user.id, "studio-segments", {
        episodeSceneCount: loaded.episodeSceneCount,
      }).catch((error) => {
        console.error("[episode-studio] onboarding check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      })
    : false;

  return (
    <EpisodeStudioPage
      seriesId={seriesId}
      episodeId={episodeId}
      seriesTitle={series.title}
      episodeTitle={episode.title}
      episodes={loaded.episodes}
      defaultOrientation={series.default_orientation}
      briefMarkdown={series.brief_markdown}
      seriesMemoryMarkdown={series.memory_markdown}
      scenes={loaded.scenes}
      ingredients={loaded.mentionIngredients}
      sheets={loaded.sheets}
      characterSheets={loaded.characterSheets}
      seedanceConfigured={loaded.seedanceConfigured}
      takesByScene={loaded.takesEnriched}
      chatMessages={loaded.chatMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_name: m.tool_name,
        tool_args: m.tool_args as Record<string, unknown> | null,
        tool_result: m.tool_result as Record<string, unknown> | null,
      }))}
      audioLines={loaded.audioLines.map((line) => ({
        id: line.id,
        title: line.title,
        description: line.description,
        ref_tag: line.ref_tag,
        assetUrl: line.assetUrl,
        assetId: line.asset_id,
      }))}
      libraryIngredients={loaded.libraryIngredients}
      costumesByCharacter={loaded.costumesByCharacter}
      sheetsByCharacter={loaded.sheetsByCharacter}
      showOnboardingSegments={showOnboardingSegments}
    />
  );
}
