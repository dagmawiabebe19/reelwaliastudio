import { NextResponse } from "next/server";
import { getOrCreateChatSession, listChatMessages } from "@/lib/db/chat";
import { runCopilotStream } from "@/lib/ai/copilot/run";
import type { CopilotContext } from "@/lib/ai/copilot/tools";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    scopeType: "series" | "episode" | "scene";
    scopeId: string;
    message: string;
    modelId?: string;
    context: CopilotContext;
  };

  const session = await getOrCreateChatSession(body.scopeType, body.scopeId);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      await runCopilotStream({
        sessionId: session.id,
        userMessage: body.message,
        context: body.context,
        modelId: body.modelId,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
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
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scopeType = searchParams.get("scopeType") as "series" | "episode" | "scene" | null;
  const scopeId = searchParams.get("scopeId");

  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: "scopeType and scopeId required." }, { status: 400 });
  }

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
}
