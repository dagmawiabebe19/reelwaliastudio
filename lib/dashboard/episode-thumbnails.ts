import "server-only";

import { getDbClient } from "@/lib/db/client";
import { getThumbnailSignedUrl } from "@/lib/storage/signed-url";

export type StorageAssetRef = {
  bucket: string;
  storage_path: string;
  media_type?: string | null;
};

type SceneThumbRow = {
  id: string;
  episode_id: string;
  sort_order: number;
  scene_ingredients: Array<{
    role: string;
    ingredients: {
      id: string;
      kind: string;
      generation_status: string | null;
      assets: StorageAssetRef | null;
    } | null;
  }> | null;
  scene_character_sheets: Array<{
    character_sheets: {
      id: string;
      status: string;
      angles: Array<{
        angle_label: string;
        assets: StorageAssetRef | null;
      }> | null;
    } | null;
  }> | null;
};

type TakeThumbRow = {
  scene_id: string;
  created_at: string;
  assets: StorageAssetRef | StorageAssetRef[] | null;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isReadyGenerationStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return status !== "failed" && status !== "pending";
}

function isImageAsset(asset: StorageAssetRef | null | undefined): asset is StorageAssetRef {
  if (!asset?.bucket || !asset.storage_path) return false;
  const mt = asset.media_type;
  if (!mt) return true;
  if (mt === "video" || mt === "audio") return false;
  return mt === "image" || mt.startsWith("image/");
}

function pickSheetAngleAsset(
  angles: Array<{ angle_label: string; assets: StorageAssetRef | null }> | null | undefined,
): StorageAssetRef | null {
  if (!angles?.length) return null;
  const front = angles.find((a) => a.angle_label === "front") ?? angles[0];
  const asset = unwrapRelation(front?.assets);
  return isImageAsset(asset) ? asset : null;
}

/** Pick best still asset for an episode using the home-dashboard fallback chain. */
export function pickEpisodeThumbnailAsset(input: {
  scenes: SceneThumbRow[];
  takes: TakeThumbRow[];
  seriesKeyArt: StorageAssetRef | null;
}): StorageAssetRef | null {
  const { scenes, takes, seriesKeyArt } = input;
  const scenesByOrder = [...scenes].sort((a, b) => a.sort_order - b.sort_order);

  // (a) Most recent ready take with an image asset (video takes → skip to next step).
  const takesNewestFirst = [...takes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const take of takesNewestFirst) {
    const asset = unwrapRelation(take.assets);
    if (isImageAsset(asset)) return asset;
  }

  // (b) First scene's bound location image.
  const firstScene = scenesByOrder[0];
  if (firstScene) {
    for (const binding of firstScene.scene_ingredients ?? []) {
      const ing = binding.ingredients;
      if (!ing || ing.kind !== "location") continue;
      if (!isReadyGenerationStatus(ing.generation_status)) continue;
      if (isImageAsset(ing.assets)) return ing.assets;
    }
  }

  // (c) Bound character sheets or character headshots across scenes.
  for (const scene of scenesByOrder) {
    for (const binding of scene.scene_character_sheets ?? []) {
      const sheet = binding.character_sheets;
      if (!sheet || sheet.status !== "ready") continue;
      const asset = pickSheetAngleAsset(sheet.angles);
      if (asset) return asset;
    }
    for (const binding of scene.scene_ingredients ?? []) {
      const ing = binding.ingredients;
      if (!ing || ing.kind !== "character") continue;
      if (!isReadyGenerationStatus(ing.generation_status)) continue;
      if (isImageAsset(ing.assets)) return ing.assets;
    }
  }

  // (d) Series key art.
  if (isImageAsset(seriesKeyArt)) return seriesKeyArt;

  return null;
}

async function signThumbnailAsset(
  asset: StorageAssetRef,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const key = `${asset.bucket}:${asset.storage_path}`;
  if (cache.has(key)) return cache.get(key)!;
  const url = await getThumbnailSignedUrl(asset.bucket, asset.storage_path);
  cache.set(key, url);
  return url;
}

export function seriesPlaceholderInitial(seriesTitle: string): string {
  const trimmed = seriesTitle.trim();
  if (!trimmed) return "?";
  const first = trimmed.replace(/^[^a-zA-Z0-9]+/, "").charAt(0);
  return (first || trimmed.charAt(0)).toUpperCase();
}

/**
 * Batch-resolve episode thumbnail URLs for the home dashboard.
 * Uses the same signed-URL path as the References panel, with thumbnail transforms.
 */
export async function resolveEpisodeThumbnailUrls(input: {
  episodes: Array<{ id: string; seriesId: string; seriesTitle: string }>;
  seriesKeyArtBySeriesId: Map<string, StorageAssetRef | null>;
}): Promise<Map<string, { url: string | null; initial: string }>> {
  const result = new Map<string, { url: string | null; initial: string }>();
  if (input.episodes.length === 0) return result;

  for (const ep of input.episodes) {
    result.set(ep.id, {
      url: null,
      initial: seriesPlaceholderInitial(ep.seriesTitle),
    });
  }

  const episodeIds = input.episodes.map((e) => e.id);
  const supabase = await getDbClient();

  const { data: scenesRaw, error: scenesError } = await supabase
    .from("scenes")
    .select(
      `id, episode_id, sort_order,
      scene_ingredients(
        role,
        ingredients(id, kind, generation_status, assets:primary_asset_id(bucket, storage_path, media_type))
      ),
      scene_character_sheets(
        character_sheet_id,
        character_sheets(
          id, status,
          angles:character_sheet_angles(angle_label, assets:asset_id(bucket, storage_path, media_type))
        )
      )`,
    )
    .in("episode_id", episodeIds)
    .neq("status", "archived")
    .order("sort_order", { ascending: true });

  if (scenesError) {
    console.warn("[episode-thumbnails] scenes query failed", scenesError.message);
    return result;
  }

  const scenes = (scenesRaw ?? []) as unknown as SceneThumbRow[];
  const sceneIds = scenes.map((s) => s.id);
  const scenesByEpisode = new Map<string, SceneThumbRow[]>();
  for (const scene of scenes) {
    const list = scenesByEpisode.get(scene.episode_id) ?? [];
    list.push(scene);
    scenesByEpisode.set(scene.episode_id, list);
  }

  let takes: TakeThumbRow[] = [];
  if (sceneIds.length > 0) {
    const { data: takesRaw, error: takesError } = await supabase
      .from("takes")
      .select("scene_id, created_at, assets:asset_id(bucket, storage_path, media_type)")
      .in("scene_id", sceneIds)
      .eq("status", "ready")
      .not("asset_id", "is", null)
      .order("created_at", { ascending: false });

    if (takesError) {
      console.warn("[episode-thumbnails] takes query failed", takesError.message);
    } else {
      takes = (takesRaw ?? []) as unknown as TakeThumbRow[];
    }
  }

  const takesByEpisode = new Map<string, TakeThumbRow[]>();
  const sceneToEpisode = new Map(scenes.map((s) => [s.id, s.episode_id]));
  for (const take of takes) {
    const episodeId = sceneToEpisode.get(take.scene_id);
    if (!episodeId) continue;
    const list = takesByEpisode.get(episodeId) ?? [];
    list.push(take);
    takesByEpisode.set(episodeId, list);
  }

  const urlCache = new Map<string, string | null>();

  await Promise.all(
    input.episodes.map(async (ep) => {
      const asset = pickEpisodeThumbnailAsset({
        scenes: scenesByEpisode.get(ep.id) ?? [],
        takes: takesByEpisode.get(ep.id) ?? [],
        seriesKeyArt: input.seriesKeyArtBySeriesId.get(ep.seriesId) ?? null,
      });
      if (!asset) return;
      const url = await signThumbnailAsset(asset, urlCache);
      if (url) {
        result.set(ep.id, {
          url,
          initial: seriesPlaceholderInitial(ep.seriesTitle),
        });
      }
    }),
  );

  return result;
}

/** Parse series key-art asset from a Supabase nested join. */
export function parseSeriesKeyArtAsset(
  keyArt: StorageAssetRef | StorageAssetRef[] | null | undefined,
): StorageAssetRef | null {
  const asset = unwrapRelation(keyArt);
  return isImageAsset(asset) ? asset : null;
}
