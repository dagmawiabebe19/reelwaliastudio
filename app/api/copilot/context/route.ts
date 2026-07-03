import { NextResponse } from "next/server";
import { buildCopilotContextSnapshot } from "@/lib/copilot/context-snapshot";
import type { CopilotWorkspaceView } from "@/lib/copilot/workspace-types";
import { getActiveUserId } from "@/lib/auth/getUser";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { parseUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await getActiveUserId();

    const { searchParams } = new URL(request.url);
    const seriesId = searchParams.get("seriesId");
    const episodeId = searchParams.get("episodeId") ?? undefined;
    const sceneId = searchParams.get("sceneId") ?? undefined;

    if (!seriesId) {
      return NextResponse.json({ error: "seriesId required." }, { status: 400 });
    }

    parseUuid(seriesId, "seriesId");
    await verifySeriesOwnership(seriesId);
    if (episodeId) parseUuid(episodeId, "episodeId");
    if (sceneId) parseUuid(sceneId, "sceneId");

    let workspace: CopilotWorkspaceView | undefined;
    const workspaceRaw = searchParams.get("workspace");
    if (workspaceRaw) {
      if (workspaceRaw.length > 16_000) {
        return NextResponse.json({ error: "Workspace payload too large." }, { status: 400 });
      }
      try {
        workspace = JSON.parse(workspaceRaw) as CopilotWorkspaceView;
      } catch {
        return NextResponse.json({ error: "Invalid workspace JSON." }, { status: 400 });
      }
    }

    const context = await buildCopilotContextSnapshot({
      seriesId,
      episodeId,
      sceneId,
      workspace,
    });
    return NextResponse.json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load context.";
    const status = message === "Not authenticated" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
