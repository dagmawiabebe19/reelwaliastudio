import { NextResponse } from "next/server";
import { queueEpisodeFilmExport } from "@/lib/export/episode-film";
import { getLatestEpisodeExport } from "@/lib/db/episode-exports";
import { getAsset } from "@/lib/db/assets";
import { getSignedUrl } from "@/lib/storage/signed-url";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ episodeId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { episodeId } = await params;
    const { seriesId } = (await request.json()) as { seriesId: string };
    if (!seriesId) {
      return NextResponse.json({ error: "seriesId required." }, { status: 400 });
    }

    const exportId = await queueEpisodeFilmExport(episodeId, seriesId);
    return NextResponse.json({ exportId, status: "pending" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start export." },
      { status: 400 },
    );
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { episodeId } = await params;
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get export status." },
      { status: 400 },
    );
  }
}
