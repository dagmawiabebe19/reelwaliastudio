import { NextResponse } from "next/server";
import { buildSceneStarredTakesZip } from "@/lib/export/scene-zip";
import { getActiveUserId } from "@/lib/auth/getUser";
import { verifySceneOwnership } from "@/lib/db/scenes";
import { parseUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ sceneId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await getActiveUserId();
    const { sceneId } = await params;
    parseUuid(sceneId, "sceneId");
    await verifySceneOwnership(sceneId);

    const { buffer, filename } = await buildSceneStarredTakesZip(sceneId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    const status = message === "Not authenticated" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
