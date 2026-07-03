import "server-only";

import { getBalance } from "@/lib/credits/balance";
import type { CreditBalance } from "@/lib/credits/types";
import { getDbClient } from "@/lib/db/client";
import { getAsset } from "@/lib/db/assets";
import { resolveAssetUrl } from "@/lib/storage/resolve-urls";

export type HomeRecentEpisode = {
  id: string;
  title: string;
  seriesId: string;
  seriesTitle: string;
  updatedAt: string;
  thumbnailUrl: string | null;
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

async function resolveEpisodeThumbnails(
  episodeIds: string[],
): Promise<Map<string, string>> {
  if (episodeIds.length === 0) return new Map();

  const supabase = await getDbClient();
  const { data: scenes, error: scenesError } = await supabase
    .from("scenes")
    .select("id, episode_id")
    .in("episode_id", episodeIds);

  if (scenesError || !scenes?.length) return new Map();

  const sceneIds = scenes.map((s) => s.id);
  const sceneToEpisode = new Map(scenes.map((s) => [s.id, s.episode_id]));

  const { data: takes, error: takesError } = await supabase
    .from("takes")
    .select("scene_id, asset_id, created_at, assets:asset_id(bucket, storage_path)")
    .in("scene_id", sceneIds)
    .eq("status", "ready")
    .not("asset_id", "is", null)
    .order("created_at", { ascending: false });

  if (takesError || !takes?.length) return new Map();

  const thumbByEpisode = new Map<string, string>();
  for (const take of takes) {
    const episodeId = sceneToEpisode.get(take.scene_id);
    if (!episodeId || thumbByEpisode.has(episodeId)) continue;
    const raw = take.assets;
    const asset = (Array.isArray(raw) ? raw[0] : raw) as
      | { bucket: string; storage_path: string }
      | null
      | undefined;
    if (!asset) continue;
    const url = await resolveAssetUrl(asset);
    if (url) thumbByEpisode.set(episodeId, url);
  }

  return thumbByEpisode;
}

export async function getHomeDashboardData(userId: string): Promise<HomeDashboardData> {
  const supabase = await getDbClient();

  const [balance, episodesResult, takesResult] = await Promise.all([
    getBalance(userId),
    supabase
      .from("episodes")
      .select(
        "id, title, updated_at, series_id, series!inner(id, title, projects!inner(owner_id))",
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

  const episodeRows = episodesResult.data ?? [];
  const thumbMap = await resolveEpisodeThumbnails(episodeRows.map((e) => e.id));

  const recentEpisodes: HomeRecentEpisode[] = episodeRows.map((row) => {
    const series = unwrapRelation(row.series as { id: string; title: string } | { id: string; title: string }[]);
    if (!series) {
      return {
        id: row.id,
        title: row.title,
        seriesId: row.series_id,
        seriesTitle: "Series",
        updatedAt: row.updated_at,
        thumbnailUrl: thumbMap.get(row.id) ?? null,
      };
    }
    return {
      id: row.id,
      title: row.title,
      seriesId: series.id,
      seriesTitle: series.title,
      updatedAt: row.updated_at,
      thumbnailUrl: thumbMap.get(row.id) ?? null,
    };
  });

  const generatingTakes: HomeGeneratingTake[] = (takesResult.data ?? []).flatMap((row) => {
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
    } | {
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
    }[]);
    if (!scene) return [];

    const episode = unwrapRelation(scene.episodes);
    if (!episode) return [];
    const series = unwrapRelation(episode.series);
    if (!series) return [];

    return [{
      id: row.id,
      status: row.status,
      takeNumber: row.take_number,
      episodeId: episode.id,
      episodeTitle: episode.title,
      seriesId: series.id,
      seriesTitle: series.title,
      sceneTitle: scene.title,
    }];
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
  return resolveAssetUrl({ bucket: asset.bucket, storage_path: asset.storage_path });
}
