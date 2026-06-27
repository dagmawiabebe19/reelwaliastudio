import { notFound } from "next/navigation";
import { SeriesWorkspace } from "@/components/series/SeriesWorkspace";
import { getPublicModelCatalog } from "@/lib/ai/registry";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { getIngredientCounts, listIngredientsBySeries } from "@/lib/db/ingredients";
import { listEpisodesBySeries } from "@/lib/db/episodes";
import { getSeries, getSeriesStats } from "@/lib/db/series";
import { resolveAssetUrls } from "@/lib/storage/resolve-urls";

interface SeriesPageProps {
  params: Promise<{ id: string }>;
}

export default async function SeriesPage({ params }: SeriesPageProps) {
  const { id } = await params;

  const [series, stats, ingredientsRaw, counts, activeEpisodes, archivedEpisodes, chatSession] =
    await Promise.all([
      getSeries(id),
      getSeriesStats(id),
      listIngredientsBySeries(id),
      getIngredientCounts(id),
      listEpisodesBySeries(id, "active"),
      listEpisodesBySeries(id, "archived"),
      getOrCreateChatSession("series", id),
    ]);

  if (!series) notFound();

  const chatMessages = await listChatMessages(chatSession.id);
  const models = getPublicModelCatalog();

  const ingredientsWithUrls = await resolveAssetUrls(
    ingredientsRaw.map((i) => ({
      ...i,
      assets: i.assets,
    })),
  );

  const ingredients = ingredientsWithUrls.map((i) => ({
    id: i.id,
    kind: i.kind,
    name: i.name,
    description: i.description,
    ref_tag: i.ref_tag,
    assetUrl: i.assetUrl,
    mediaType: i.assets?.media_type ?? null,
  }));

  return (
    <SeriesWorkspace
      series={{
        id: series.id,
        title: series.title,
        slug: series.slug,
        status: series.status,
        default_orientation: series.default_orientation,
        brief_markdown: series.brief_markdown,
      }}
      stats={stats}
      counts={counts}
      ingredients={ingredients}
      activeEpisodes={activeEpisodes}
      archivedEpisodes={archivedEpisodes}
      models={models}
      chatMessages={chatMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_name: m.tool_name,
        tool_args: m.tool_args as Record<string, unknown> | null,
        tool_result: m.tool_result as Record<string, unknown> | null,
      }))}
    />
  );
}
