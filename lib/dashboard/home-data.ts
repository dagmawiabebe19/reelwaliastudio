import "server-only";

import { getBalance } from "@/lib/credits/balance";
import type { CreditBalance } from "@/lib/credits/types";
import { getDbClient } from "@/lib/db/client";
import { getAsset } from "@/lib/db/assets";
import {
  parseSeriesKeyArtAsset,
  resolveEpisodeThumbnailUrls,
  seriesPlaceholderInitial,
  type StorageAssetRef,
} from "@/lib/dashboard/episode-thumbnails";
import { getThumbnailSignedUrl } from "@/lib/storage/signed-url";

export type HomeRecentEpisode = {
  id: string;
  title: string;
  seriesId: string;
  seriesTitle: string;
  updatedAt: string;
  thumbnailUrl: string | null;
  thumbnailInitial: string;
};

export type HomeGeneratingTake = {
  id: string;
  status: string;
  takeNumber: number;
  episodeId: string;
  episodeTitle: string;
  seriesId: string;
  seriesTitle: string;
  sceneTitle: string | null;
  thumbnailUrl: string | null;
  thumbnailInitial: string;
};

export type HomeDashboardData = {
  recentEpisodes: HomeRecentEpisode[];
  generatingTakes: HomeGeneratingTake[];
  balance: CreditBalance;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type EpisodeRow = {
  id: string;
  title: string;
  updated_at: string;
  series_id: string;
  series:
    | {
        id: string;
        title: string;
        thumbnail_asset_id: string | null;
        key_art: StorageAssetRef | StorageAssetRef[] | null;
      }
    | Array<{
        id: string;
        title: string;
        thumbnail_asset_id: string | null;
        key_art: StorageAssetRef | StorageAssetRef[] | null;
      }>;
};

export async function getHomeDashboardData(userId: string): Promise<HomeDashboardData> {
  const supabase = await getDbClient();

  const [balance, episodesResult, takesResult] = await Promise.all([
    getBalance(userId),
    supabase
      .from("episodes")
      .select(
        `id, title, updated_at, series_id,
        series!inner(
          id, title, thumbnail_asset_id,
          key_art:thumbnail_asset_id(bucket, storage_path, media_type),
          projects!inner(owner_id)
        )`,
      )
      .eq("series.projects.owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("takes")
      .select(
        `id, status, take_number,
        scenes!inner(
          id, title, episode_id,
          episodes!inner(
            id, title, series_id,
            series!inner(id, title, projects!inner(owner_id))
          )
        )`,
      )
      .eq("status", "pending")
      .eq("scenes.episodes.series.projects.owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (episodesResult.error) throw new Error(episodesResult.error.message);
  if (takesResult.error) throw new Error(takesResult.error.message);

  const episodeRows = (episodesResult.data ?? []) as unknown as EpisodeRow[];

  type GeneratingRow = {
    id: string;
    status: string;
    take_number: number;
    scenes: unknown;
  };

  const generatingRows = (takesResult.data ?? []) as unknown as GeneratingRow[];

  const parsedGenerating = generatingRows.flatMap((row) => {
    const scene = unwrapRelation(row.scenes as {
      title: string | null;
      episode_id: string;
      episodes:
        | {
            id: string;
            title: string;
            series_id: string;
            series: { id: string; title: string } | { id: string; title: string }[];
          }
        | {
            id: string;
            title: string;
            series_id: string;
            series: { id: string; title: string } | { id: string; title: string }[];
          }[];
    });
    if (!scene) return [];
    const episode = unwrapRelation(scene.episodes);
    if (!episode) return [];
    const series = unwrapRelation(episode.series);
    if (!series) return [];
    return [{
      row,
      scene,
      episode,
      series,
    }];
  });

  const seriesKeyArtBySeriesId = new Map<string, StorageAssetRef | null>();
  const episodeMetaById = new Map<string, { id: string; seriesId: string; seriesTitle: string }>();

  for (const row of episodeRows) {
    const series = unwrapRelation(row.series);
    if (!series) continue;
    episodeMetaById.set(row.id, {
      id: row.id,
      seriesId: series.id,
      seriesTitle: series.title,
    });
    if (!seriesKeyArtBySeriesId.has(series.id)) {
      seriesKeyArtBySeriesId.set(series.id, parseSeriesKeyArtAsset(series.key_art));
    }
  }

  for (const item of parsedGenerating) {
    if (!episodeMetaById.has(item.episode.id)) {
      episodeMetaById.set(item.episode.id, {
        id: item.episode.id,
        seriesId: item.series.id,
        seriesTitle: item.series.title,
      });
    }
  }

  const missingKeyArtSeriesIds = [
    ...new Set(
      [...episodeMetaById.values()]
        .map((ep) => ep.seriesId)
        .filter((id) => !seriesKeyArtBySeriesId.has(id)),
    ),
  ];
  if (missingKeyArtSeriesIds.length > 0) {
    const { data: keyArtRows } = await supabase
      .from("series")
      .select("id, key_art:thumbnail_asset_id(bucket, storage_path, media_type)")
      .in("id", missingKeyArtSeriesIds);
    for (const row of keyArtRows ?? []) {
      const parsed = row as { id: string; key_art: StorageAssetRef | StorageAssetRef[] | null };
      seriesKeyArtBySeriesId.set(parsed.id, parseSeriesKeyArtAsset(parsed.key_art));
    }
  }

  const thumbMap = await resolveEpisodeThumbnailUrls({
    episodes: [...episodeMetaById.values()],
    seriesKeyArtBySeriesId,
  });

  const recentEpisodes: HomeRecentEpisode[] = episodeRows.map((row) => {
    const series = unwrapRelation(row.series);
    const seriesTitle = series?.title ?? "Series";
    const seriesId = series?.id ?? row.series_id;
    const thumb = thumbMap.get(row.id);
    return {
      id: row.id,
      title: row.title,
      seriesId,
      seriesTitle,
      updatedAt: row.updated_at,
      thumbnailUrl: thumb?.url ?? null,
      thumbnailInitial: thumb?.initial ?? seriesPlaceholderInitial(seriesTitle),
    };
  });

  const generatingTakes: HomeGeneratingTake[] = parsedGenerating.map(({ row, scene, episode, series }) => {
    const thumb = thumbMap.get(episode.id);
    return {
      id: row.id,
      status: row.status,
      takeNumber: row.take_number,
      episodeId: episode.id,
      episodeTitle: episode.title,
      seriesId: series.id,
      seriesTitle: series.title,
      sceneTitle: scene.title,
      thumbnailUrl: thumb?.url ?? null,
      thumbnailInitial: thumb?.initial ?? seriesPlaceholderInitial(series.title),
    };
  });

  return { recentEpisodes, generatingTakes, balance };
}

/** Resolve series key-art URL from thumbnail_asset_id. */
export async function resolveSeriesKeyArtUrl(
  thumbnailAssetId: string | null,
): Promise<string | null> {
  if (!thumbnailAssetId) return null;
  const asset = await getAsset(thumbnailAssetId);
  if (!asset) return null;
  return getThumbnailSignedUrl(asset.bucket, asset.storage_path);
}
