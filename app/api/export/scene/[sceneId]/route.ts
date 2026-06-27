import { NextResponse } from "next/server";
import { buildSceneStarredTakesZip } from "@/lib/export/scene-zip";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ sceneId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { sceneId } = await params;
    const { buffer, filename } = await buildSceneStarredTakesZip(sceneId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed." },
      { status: 400 },
    );
  }
}
