import { NextResponse } from "next/server";
import { queueEpisodeFilmExport } from "@/lib/export/episode-film";
import { getLatestEpisodeExport } from "@/lib/db/episode-exports";
import { getAsset } from "@/lib/db/assets";
import { getSignedUrl } from "@/lib/storage/signed-url";
import { getActiveUserId } from "@/lib/auth/getUser";
import { verifyEpisodeOwnership } from "@/lib/db/audio-lines";
import { parseUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ episodeId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await getActiveUserId();
    const { episodeId } = await params;
    parseUuid(episodeId, "episodeId");
    await verifyEpisodeOwnership(episodeId);

    const { seriesId } = (await request.json()) as { seriesId: string };
    if (!seriesId) {
      return NextResponse.json({ error: "seriesId required." }, { status: 400 });
    }
    parseUuid(seriesId, "seriesId");

    const exportId = await queueEpisodeFilmExport(episodeId, seriesId);
    return NextResponse.json({ exportId, status: "pending" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start export.";
    const status = message === "Not authenticated" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await getActiveUserId();
    const { episodeId } = await params;
    parseUuid(episodeId, "episodeId");
    await verifyEpisodeOwnership(episodeId);

    const latest = await getLatestEpisodeExport(episodeId);
    if (!latest) {
      return NextResponse.json({ status: "none" });
    }

    let downloadUrl: string | null = null;
    if (latest.status === "ready" && latest.asset_id) {
      const asset = await getAsset(latest.asset_id);
      if (asset) {
        downloadUrl = await getSignedUrl(asset.bucket, asset.storage_path, 3600);
      }
    }

    return NextResponse.json({
      id: latest.id,
      status: latest.status,
      error_message: latest.error_message,
      downloadUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get export status.";
    const status = message === "Not authenticated" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
