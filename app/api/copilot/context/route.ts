import { NextResponse } from "next/server";
import { buildCopilotContextSnapshot } from "@/lib/copilot/context-snapshot";
import type { CopilotWorkspaceView } from "@/lib/copilot/workspace-types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const seriesId = searchParams.get("seriesId");
  const episodeId = searchParams.get("episodeId") ?? undefined;
  const sceneId = searchParams.get("sceneId") ?? undefined;

  if (!seriesId) {
    return NextResponse.json({ error: "seriesId required." }, { status: 400 });
  }

  let workspace: CopilotWorkspaceView | undefined;
  const workspaceRaw = searchParams.get("workspace");
  if (workspaceRaw) {
    try {
      workspace = JSON.parse(workspaceRaw) as CopilotWorkspaceView;
    } catch {
      return NextResponse.json({ error: "Invalid workspace JSON." }, { status: 400 });
    }
  }

  try {
    const context = await buildCopilotContextSnapshot({
      seriesId,
      episodeId,
      sceneId,
      workspace,
    });
    return NextResponse.json({ context });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load context." },
      { status: 500 },
    );
  }
}
