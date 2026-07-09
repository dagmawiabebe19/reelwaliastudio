import { notFound } from "next/navigation";
import { SeriesWorkspace } from "@/components/series/SeriesWorkspace";
import { SeriesLoadError } from "@/components/series/SeriesLoadError";
import { getActiveUserId } from "@/lib/auth/getUser";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { listCharacterSheetsBySeries } from "@/lib/db/character-sheets";
import { getIngredientCounts, listIngredientsBySeries, verifySeriesOwnership } from "@/lib/db/ingredients";
import { listEpisodesBySeries } from "@/lib/db/episodes";
import type { EpisodeWithSceneCount } from "@/lib/db/episodes";
import { getSeries, getSeriesStats } from "@/lib/db/series";
import type { SeriesStats } from "@/lib/db/database.types";
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

const EMPTY_COUNTS = {
  total: 0,
  characters: 0,
  voices: 0,
  outfits: 0,
  locations: 0,
  reference: 0,
};

const EMPTY_STATS: SeriesStats = {
  episodeCount: 0,
  ingredientCount: 0,
  runtimeSeconds: null,
};

function logSeriesLoadWarning(label: string, error: unknown, context?: Record<string, unknown>): void {
  console.error(`[series-page] ${label}`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

async function safeSeriesLoad<T>(
  label: string,
  seriesId: string,
  fallback: T,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logSeriesLoadWarning(label, error, { seriesId });
    return fallback;
  }
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { id } = await params;

  try {
    const userId = await safeSeriesLoad("auth", id, "", getActiveUserId);

    const series = await safeSeriesLoad("series fetch", id, null, () => getSeries(id));
    if (!series) notFound();

    const ownsSeries = await safeSeriesLoad(
      "ownership check",
      id,
      false,
      async () => {
        await verifySeriesOwnership(id);
        return true;
      },
    );
    if (!ownsSeries) notFound();

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
      safeSeriesLoad("series stats", id, EMPTY_STATS, () => getSeriesStats(id)),
      safeSeriesLoad("ingredients", id, [], () => listIngredientsBySeries(id)),
      safeSeriesLoad("ingredient counts", id, EMPTY_COUNTS, () => getIngredientCounts(id)),
      safeSeriesLoad("active episodes", id, [] as EpisodeWithSceneCount[], () =>
        listEpisodesBySeries(id, "active"),
      ),
      safeSeriesLoad("archived episodes", id, [] as EpisodeWithSceneCount[], () =>
        listEpisodesBySeries(id, "archived"),
      ),
      safeSeriesLoad("chat session", id, null as { id: string } | null, () =>
        getOrCreateChatSession("series", id),
      ),
      safeSeriesLoad("character sheets", id, [], () => listCharacterSheetsBySeries(id)),
      safeSeriesLoad("screenplay", id, null, () => queryScreenplayBySeries(id)),
    ]);

    const chatMessages = chatSession
      ? await safeSeriesLoad("chat history", id, [], () => listChatMessages(chatSession.id))
      : [];

    const keyArtUrl = await safeSeriesLoad("key art", id, null, () =>
      resolveSeriesKeyArtUrl(series.thumbnail_asset_id),
    );

    const ingredientsWithUrls = await safeSeriesLoad(
      "ingredient URLs",
      id,
      ingredientsRaw.map((i) => ({ ...i, assetUrl: null as string | null })),
      () =>
        resolveAssetUrls(
          ingredientsRaw.map((i) => ({
            ...i,
            assets: i.assets,
          })),
        ),
    );

    const { costumesByCharacter, sheetsByCharacter } = await safeSeriesLoad(
      "production library",
      id,
      { costumesByCharacter: {}, sheetsByCharacter: {} },
      () =>
        buildProductionLibraryData({
          ingredients: ingredientsWithUrls,
          sheets: sheetsRaw,
        }),
    );

    const characterSheets = await safeSeriesLoad("copilot character sheets", id, [], () =>
      buildCopilotCharacterSheets(sheetsRaw),
    );

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

    const showOnboardingPlanEpisode = userId
      ? await safeSeriesLoad("onboarding status", id, false, () =>
          shouldShowOnboarding(userId, "plan-episode", {
            episodeCount: activeEpisodes.length + archivedEpisodes.length,
          }),
        )
      : false;

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
      screenplayScenes = await safeSeriesLoad("screenplay scenes", id, [], () =>
        listScreenplayScenes(screenplayRow.id),
      );
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
          brief_markdown: series.brief_markdown ?? "",
          memory_markdown: series.memory_markdown ?? "",
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
  } catch (error) {
    logSeriesLoadWarning("fatal series page load", error, { seriesId: id });
    return <SeriesLoadError seriesId={id} />;
  }
}
