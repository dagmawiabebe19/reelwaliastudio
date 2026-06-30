import "server-only";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { isDevAuthBypassActive } from "@/lib/auth/bypass";
import { getActiveUserId } from "@/lib/auth/getUser";
import { createAsset, buildGeneratedAssetPath } from "@/lib/db/assets";
import { createEpisodeExport, updateEpisodeExport } from "@/lib/db/episode-exports";
import { listStarredTakesByEpisode } from "@/lib/db/takes";
import { getEpisode } from "@/lib/db/episodes";
import { getSeries } from "@/lib/db/series";
import { getStorageClient } from "@/lib/storage/client";
import { createAdminClient } from "@/lib/supabase/admin";

async function downloadAssetBuffer(bucket: string, path: string): Promise<Buffer> {
  const supabase = await getStorageClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Failed to download ${path}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function queueEpisodeFilmExport(episodeId: string, seriesId: string): Promise<string> {
  const exportJob = await createEpisodeExport(episodeId);

  after(async () => {
    try {
      await updateEpisodeExport(exportJob.id, { status: "processing" });
      const assetId = await concatEpisodeStarredTakes(episodeId, seriesId);
      await updateEpisodeExport(exportJob.id, { status: "ready", asset_id: assetId });
    } catch (error) {
      await updateEpisodeExport(exportJob.id, {
        status: "failed",
        error_message: error instanceof Error ? error.message : "Export failed.",
      });
    }
  });

  return exportJob.id;
}

async function concatEpisodeStarredTakes(episodeId: string, seriesId: string): Promise<string> {
  const takes = await listStarredTakesByEpisode(episodeId);
  if (!takes.length) throw new Error("No starred takes to concatenate.");

  const episode = await getEpisode(episodeId);
  const series = await getSeries(seriesId);
  if (!episode || !series) throw new Error("Episode or series not found.");

  const videoTakes = takes.filter((t) => t.media_type === "video" && t.assets);
  if (!videoTakes.length) {
    throw new Error("Episode film export requires at least one starred video take.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // FLAG: service-role invokes edge function (RLS bypassed server-side). Not user-scoped DB reads.
  if (supabaseUrl && serviceKey && !isDevAuthBypassActive()) {
    const admin = createAdminClient();
    const { data, error } = await admin.functions.invoke("concat-episode", {
      body: {
        episode_id: episodeId,
        series_id: seriesId,
        take_paths: videoTakes.map((t) => ({
          bucket: t.assets!.bucket,
          path: t.assets!.storage_path,
        })),
        orientation: series.default_orientation,
      },
    });

    if (!error && data?.asset_id) {
      return String(data.asset_id);
    }
  }

  const ownerId = await getActiveUserId();
  const buffers: Buffer[] = [];
  for (const take of videoTakes) {
    if (!take.assets) continue;
    buffers.push(await downloadAssetBuffer(take.assets.bucket, take.assets.storage_path));
  }

  const combined = Buffer.concat(buffers);
  const storagePath = buildGeneratedAssetPath(ownerId, episodeId, "mp4", randomUUID());
  const supabase = await getStorageClient();
  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(storagePath, combined, { contentType: "video/mp4", upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const asset = await createAsset({
    bucket: "assets",
    storagePath,
    mediaType: "video",
    source: "generated",
    model: "episode-concat",
    prompt: `Concatenated film for episode ${episode.title}`,
    durationMs: null,
  });

  return asset.id;
}
