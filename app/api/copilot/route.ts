import { NextResponse } from "next/server";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { runCopilotStream } from "@/lib/ai/copilot/run";
import type { CopilotContext } from "@/lib/ai/copilot/tools";
import { getActiveUserId } from "@/lib/auth/getUser";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { verifyEpisodeOwnership } from "@/lib/db/audio-lines";
import { verifySceneOwnership } from "@/lib/db/scenes";
import {
  checkRateLimit,
  getRequestClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { parseUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

const MAX_COPILOT_MESSAGE_LENGTH = 12_000;

async function verifyCopilotScope(
  scopeType: "series" | "episode" | "scene",
  scopeId: string,
): Promise<void> {
  parseUuid(scopeId, "scopeId");
  if (scopeType === "series") {
    await verifySeriesOwnership(scopeId);
    return;
  }
  if (scopeType === "episode") {
    await verifyEpisodeOwnership(scopeId);
    return;
  }
  await verifySceneOwnership(scopeId);
}

async function assertCopilotContext(context: CopilotContext): Promise<void> {
  parseUuid(context.seriesId, "seriesId");
  await verifySeriesOwnership(context.seriesId);
  if (context.episodeId) {
    parseUuid(context.episodeId, "episodeId");
  }
  if (context.sceneId) {
    parseUuid(context.sceneId, "sceneId");
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getActiveUserId();
    const ip = getRequestClientIp(request);
    const limit = checkRateLimit(`copilot:post:${userId}:${ip}`, 30, 60_000);
    if (!limit.ok) {
      return rateLimitResponse(limit.retryAfterSeconds);
    }

    const body = (await request.json()) as {
      scopeType: "series" | "episode" | "scene";
      scopeId: string;
      message: string;
      modelId?: string;
      context: CopilotContext;
    };

    if (!body.message?.trim() || body.message.length > MAX_COPILOT_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    }

    parseUuid(body.scopeId, "scopeId");
    await verifyCopilotScope(body.scopeType, body.scopeId);
    await assertCopilotContext(body.context);

    const session = await getOrCreateChatSession(body.scopeType, body.scopeId);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch (error) {
            console.warn("[copilot-sse] dropped event after stream close", {
              type: event.type,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        };

        await runCopilotStream({
          sessionId: session.id,
          userMessage: body.message,
          context: body.context,
          modelId: body.modelId,
          scopeType: body.scopeType,
          scopeId: body.scopeId,
          abortSignal: request.signal,
          onEvent: (event) => send(event),
        });

        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copilot request failed.";
    const status = message === "Not authenticated" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(request: Request) {
  try {
    await getActiveUserId();

    const { searchParams } = new URL(request.url);
    const scopeType = searchParams.get("scopeType") as "series" | "episode" | "scene" | null;
    const scopeId = searchParams.get("scopeId");

    if (!scopeType || !scopeId) {
      return NextResponse.json({ error: "scopeType and scopeId required." }, { status: 400 });
    }

    await verifyCopilotScope(scopeType, scopeId);

    const session = await getOrCreateChatSession(scopeType, scopeId);
    const messages = await listChatMessages(session.id);

    return NextResponse.json({
      sessionId: session.id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_name: m.tool_name,
        tool_args: m.tool_args,
        tool_result: m.tool_result,
        created_at: m.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load chat.";
    const status = message === "Not authenticated" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
