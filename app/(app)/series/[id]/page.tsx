import { notFound } from "next/navigation";
import { SeriesWorkspace } from "@/components/series/SeriesWorkspace";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { getIngredientCounts, listIngredientsBySeries, verifySeriesOwnership } from "@/lib/db/ingredients";
import { listEpisodesBySeries } from "@/lib/db/episodes";
import { getSeries, getSeriesStats } from "@/lib/db/series";
import {
  buildCopilotCharacterSheets,
  buildProductionLibraryData,
} from "@/lib/production/library-data";
import { resolveSeriesKeyArtUrl } from "@/lib/dashboard/home-data";
import { resolveAssetUrls } from "@/lib/storage/resolve-urls";
import { shouldShowOnboarding } from "@/lib/onboarding/status";
import { listScreenplayScenes, queryScreenplayBySeries } from "@/lib/db/screenplays";
import { buildScreenplayDigest, formatScreenplayDigestForCopilot } from "@/lib/screenplay/digest";

interface SeriesPageProps {
  params: Promise<{ id: string }>;
}

function logSeriesLoadWarning(label: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[series-page] ${label}`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { id } = await params;
  const userId = await getActiveUserId();

  const series = await getSeries(id);
  if (!series) notFound();

  try {
    await verifySeriesOwnership(id);
  } catch {
    notFound();
  }

  const [
    stats,
    ingredientsRaw,
    counts,
    activeEpisodes,
    archivedEpisodes,
    chatSession,
    sheetsRaw,
    screenplayRow,
  ] = await Promise.all([
    getSeriesStats(id),
    listIngredientsBySeries(id),
    getIngredientCounts(id),
    listEpisodesBySeries(id, "active"),
    listEpisodesBySeries(id, "archived"),
    getOrCreateChatSession("series", id),
    listCharacterSheetsBySeries(id),
    queryScreenplayBySeries(id),
  ]);

  const [chatMessages, keyArtUrl] = await Promise.all([
    listChatMessages(chatSession.id).catch((error) => {
      logSeriesLoadWarning("chat history load failed", error, { seriesId: id });
      return [];
    }),
    resolveSeriesKeyArtUrl(series.thumbnail_asset_id).catch((error) => {
      logSeriesLoadWarning("key art resolve failed", error, { seriesId: id });
      return null;
    }),
  ]);

  const ingredientsWithUrls = await resolveAssetUrls(
    ingredientsRaw.map((i) => ({
      ...i,
      assets: i.assets,
    })),
  ).catch((error) => {
    logSeriesLoadWarning("ingredient URL resolve failed", error, { seriesId: id });
    return ingredientsRaw.map((i) => ({ ...i, assetUrl: null as string | null }));
  });

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

  let screenplayScenes: Awaited<ReturnType<typeof listScreenplayScenes>> = [];
  if (screenplayRow?.status === "parsed") {
    screenplayScenes = await listScreenplayScenes(screenplayRow.id);
  }

  let screenplayDigest: string | null = null;
  if (screenplayRow?.status === "parsed" && screenplayScenes.length > 0) {
    try {
      screenplayDigest = formatScreenplayDigestForCopilot(
        buildScreenplayDigest({
          screenplay: screenplayRow,
          scenes: screenplayScenes,
        }),
      );
    } catch (error) {
      logSeriesLoadWarning("screenplay digest build failed", error, {
        seriesId: id,
        screenplayId: screenplayRow.id,
      });
    }
  }

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
      screenplay={
        screenplayRow
          ? {
              id: screenplayRow.id,
              title: screenplayRow.title,
              format: screenplayRow.format,
              status: screenplayRow.status,
              failReason: screenplayRow.fail_reason,
              sceneCount: screenplayRow.scene_count,
              pageCountEst: screenplayRow.page_count_est,
              characterCount: screenplayRow.characterCount,
              locationCount: screenplayRow.locationCount,
              createdAt: screenplayRow.created_at,
              analysisStatus: screenplayRow.analysis_status,
              analysisFailReason: screenplayRow.analysis_fail_reason,
              analysisProposal: screenplayRow.analysis_proposal,
            }
          : null
      }
      screenplayDigest={screenplayDigest}
      screenplayId={screenplayRow?.status === "parsed" ? screenplayRow.id : null}
    />
  );
}
