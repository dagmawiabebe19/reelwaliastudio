import { notFound } from "next/navigation";
import { SeriesWorkspace } from "@/components/series/SeriesWorkspace";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { getIngredientCounts, listIngredientsBySeries } from "@/lib/db/ingredients";
import { listEpisodesBySeries } from "@/lib/db/episodes";
import { getSeries, getSeriesStats } from "@/lib/db/series";
import {
  buildCopilotCharacterSheets,
  buildProductionLibraryData,
} from "@/lib/production/library-data";
import { resolveSeriesKeyArtUrl } from "@/lib/dashboard/home-data";
import { resolveAssetUrls } from "@/lib/storage/resolve-urls";
import { shouldShowOnboarding } from "@/lib/onboarding/status";

interface SeriesPageProps {
  params: Promise<{ id: string }>;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { id } = await params;
  const userId = await getActiveUserId();

  const [series, stats, ingredientsRaw, counts, activeEpisodes, archivedEpisodes, chatSession, sheetsRaw] =
    await Promise.all([
      getSeries(id),
      getSeriesStats(id),
      listIngredientsBySeries(id),
      getIngredientCounts(id),
      listEpisodesBySeries(id, "active"),
      listEpisodesBySeries(id, "archived"),
      getOrCreateChatSession("series", id),
      listCharacterSheetsBySeries(id),
    ]);

  if (!series) notFound();

  const [chatMessages, keyArtUrl] = await Promise.all([
    listChatMessages(chatSession.id),
    resolveSeriesKeyArtUrl(series.thumbnail_asset_id),
  ]);

  const ingredientsWithUrls = await resolveAssetUrls(
    ingredientsRaw.map((i) => ({
      ...i,
      assets: i.assets,
    })),
  );

  const { costumesByCharacter, sheetsByCharacter } = await buildProductionLibraryData({
    ingredients: ingredientsWithUrls,
    sheets: sheetsRaw,
  });

  const characterSheets = await buildCopilotCharacterSheets(sheetsRaw);

  const ingredients = ingredientsWithUrls.map((i) => ({
    id: i.id,
    kind: i.kind,
    name: i.name,
    description: i.description,
    ref_tag: i.ref_tag,
    assetUrl: i.assetUrl,
    mediaType: i.assets?.media_type ?? null,
    characterId: i.character_id,
    createdAt: i.created_at,
    generationStatus: i.generation_status,
    generationError: i.generation_error,
  }));

  const episodes = [...activeEpisodes, ...archivedEpisodes].map((ep) => ({
    id: ep.id,
    title: ep.title,
  }));

  const showOnboardingPlanEpisode = await shouldShowOnboarding(userId, "plan-episode", {
    episodeCount: activeEpisodes.length + archivedEpisodes.length,
  });

  const keyArtPickableIngredients = ingredients.filter(
    (i) =>
      i.assetUrl &&
      (i.kind === "location" ||
        i.kind === "reference" ||
        i.kind === "character" ||
        i.kind === "prop"),
  );

  return (
    <SeriesWorkspace
      series={{
        id: series.id,
        title: series.title,
        slug: series.slug,
        status: series.status,
        default_orientation: series.default_orientation,
        brief_markdown: series.brief_markdown,
        memory_markdown: series.memory_markdown,
      }}
      stats={{ episodeCount: stats.episodeCount }}
      counts={counts}
      ingredients={ingredients}
      costumesByCharacter={costumesByCharacter}
      sheetsByCharacter={sheetsByCharacter}
      episodes={episodes}
      characterSheets={characterSheets}
      activeEpisodes={activeEpisodes}
      archivedEpisodes={archivedEpisodes}
      chatMessages={chatMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_name: m.tool_name,
        tool_args: m.tool_args as Record<string, unknown> | null,
        tool_result: m.tool_result as Record<string, unknown> | null,
      }))}
      showOnboardingPlanEpisode={showOnboardingPlanEpisode}
      keyArtUrl={keyArtUrl}
      keyArtPickableIngredients={keyArtPickableIngredients}
    />
  );
}
