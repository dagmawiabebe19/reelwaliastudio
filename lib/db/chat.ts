import "server-only";

import { getDbClient } from "@/lib/db/client";
import type { ChatMessage, ChatScopeType, Json, TablesInsert } from "@/lib/db/database.types";

export async function getOrCreateChatSession(
  scopeType: ChatScopeType,
  scopeId: string,
): Promise<{ id: string }> {
  const supabase = await getDbClient();
  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .maybeSingle();

  if (existing) return existing;

  const payload: TablesInsert<"chat_sessions"> = {
    scope_type: scopeType,
    scope_id: scopeId,
  };

  const { data, error } = await supabase.from("chat_sessions").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const supabase = await getDbClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function appendChatMessage(input: {
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  toolName?: string | null;
  toolArgs?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
}): Promise<ChatMessage> {
  const supabase = await getDbClient();
  const payload: TablesInsert<"chat_messages"> = {
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    tool_name: input.toolName ?? null,
    tool_args: (input.toolArgs ?? null) as Json | null,
    tool_result: (input.toolResult ?? null) as Json | null,
  };

  const { data, error } = await supabase.from("chat_messages").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
}
