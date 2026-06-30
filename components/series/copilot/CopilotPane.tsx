"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { writeHighlightSegments } from "@/lib/storyboard/episode-buckets";
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
} from "@/lib/ai/anthropic-models";

import type { CopilotOutputEvent } from "@/lib/copilot/output";

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_name?: string | null;
  tool_args?: Record<string, unknown> | null;
  tool_result?: Record<string, unknown> | null;
  tool_status?: "running" | "done";
  step?: number;
  total?: number;
};

export type MentionIngredient = {
  id: string;
  ref_tag: string;
  name: string;
};

export type CopilotContextPayload = {
  seriesId: string;
  episodeId?: string;
  sceneId?: string;
  seriesTitle: string;
  defaultOrientation: string;
  briefMarkdown?: string;
  seriesMemoryMarkdown?: string;
  scenes?: Array<{ id: string; title: string; prompt: string | null; act_label: string | null }>;
  ingredients?: Array<{
    id: string;
    ref_tag: string;
    name: string;
    kind: string;
    character_id?: string | null;
    generation_status?: string;
  }>;
  characterSheets?: Array<{
    id: string;
    name: string;
    character_id: string;
    character_name: string;
    costume_name: string | null;
    status: string;
    episode_ids: string[];
  }>;
  workspace?: {
    view: string;
    viewLabel: string;
    episodeTitle?: string;
    sceneTitle?: string;
    scenePrompt?: string | null;
    sceneActLabel?: string | null;
    selectedCharacterName?: string;
    selectedIngredientName?: string;
    activeTakeSummary?: string;
  };
};

interface CopilotPaneProps {
  scopeType: "series" | "episode" | "scene";
  scopeId: string;
  context: CopilotContextPayload;
  ingredients: MentionIngredient[];
  initialMessages?: ChatMessageData[];
  controlledMessages?: ChatMessageData[];
  onMessagesChange?: (messages: ChatMessageData[]) => void;
  getLiveContext?: () => CopilotContextPayload | null;
  onOutputEvent?: (event: CopilotOutputEvent) => void;
  messageBanner?: ReactNode;
  className?: string;
}

function toolMessageClass(message: ChatMessageData): string {
  if (message.role !== "tool") return "";
  if (message.tool_status === "running") return "text-amber-400";
  if (message.content.toLowerCase().includes("failed")) return "text-accent";
  return "text-emerald-400";
}

export function CopilotPane({
  scopeType,
  scopeId,
  context,
  ingredients,
  initialMessages = [],
  controlledMessages,
  onMessagesChange,
  getLiveContext,
  onOutputEvent,
  messageBanner,
  className,
}: CopilotPaneProps) {
  const router = useRouter();
  const [internalMessages, setInternalMessages] = useState<ChatMessageData[]>(initialMessages);
  const messages = controlledMessages ?? internalMessages;

  const setMessages = useCallback(
    (updater: ChatMessageData[] | ((prev: ChatMessageData[]) => ChatMessageData[])) => {
      const current = controlledMessages ?? internalMessages;
      const next = typeof updater === "function" ? updater(current) : updater;
      if (onMessagesChange) onMessagesChange(next);
      else setInternalMessages(next);
    },
    [controlledMessages, internalMessages, onMessagesChange],
  );

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [abortNote, setAbortNote] = useState<string | null>(null);
  const [copilotModel, setCopilotModel] = useState<string>(DEFAULT_ANTHROPIC_MODEL);
  const [mentionOpen, setMentionOpen] = useState(false);
  const messageLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  useEffect(() => {
    const log = messageLogRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [messages, streaming]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);
    setAbortNote(null);
    abortRef.current = new AbortController();
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text },
    ]);

    let assistantBuffer = "";
    const assistantId = `assistant-${Date.now()}`;

    try {
      const live = getLiveContext?.() ?? context;
      let resolvedContext = { ...live };

      try {
        const params = new URLSearchParams({ seriesId: live.seriesId });
        if (live.episodeId) params.set("episodeId", live.episodeId);
        if (live.sceneId) params.set("sceneId", live.sceneId);
        if (live.workspace) params.set("workspace", JSON.stringify(live.workspace));
        const refresh = await fetch(`/api/copilot/context?${params.toString()}`);
        if (refresh.ok) {
          const data = (await refresh.json()) as { context: CopilotContextPayload };
          resolvedContext = {
            ...data.context,
            workspace: live.workspace ?? data.context.workspace,
          };
        }
      } catch {
        // use live context if refresh fails
      }

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType,
          scopeId,
          message: text,
          modelId: copilotModel,
          context: resolvedContext,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Co-pilot request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            content?: string;
            toolId?: string;
            name?: string;
            args?: Record<string, unknown>;
            message?: string;
            step?: number;
            total?: number;
            result?: Record<string, unknown>;
            summary?: string;
            payload?: CopilotOutputEvent;
            inFlightNote?: string;
          };

          if (event.type === "text" && event.content) {
            assistantBuffer += event.content;
            setMessages((prev) => {
              const existing = prev.find((m) => m.id === assistantId);
              if (existing) {
                return prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantBuffer } : m,
                );
              }
              return [
                ...prev,
                { id: assistantId, role: "assistant", content: assistantBuffer },
              ];
            });
          }

          if (event.type === "tool_start" && event.name && event.toolId) {
            setMessages((prev) => [
              ...prev,
              {
                id: event.toolId!,
                role: "tool",
                content: `TOOL ${event.name} — running…`,
                tool_name: event.name,
                tool_args: event.args ?? null,
                tool_status: "running",
              },
            ]);
          }

          if (event.type === "tool_progress" && event.toolId && event.message) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === event.toolId
                  ? {
                      ...m,
                      content: event.message!,
                      tool_status: "running" as const,
                      step: event.step,
                      total: event.total,
                    }
                  : m,
              ),
            );
          }

          if (event.type === "tool_done" && event.toolId && event.name) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === event.toolId
                  ? {
                      ...m,
                      content: event.summary ?? `TOOL ${event.name} DONE`,
                      tool_result: event.result ?? null,
                      tool_status: "done",
                      step: undefined,
                      total: undefined,
                    }
                  : m,
              ),
            );
            if (event.name === "draft_storyboard") {
              const created = Array.isArray(event.result?.created)
                ? (event.result?.created as string[])
                : [];
              if (created.length) {
                writeHighlightSegments({
                  sceneIds: created,
                  episodeId:
                    typeof event.result?.episode_id === "string"
                      ? event.result.episode_id
                      : undefined,
                });
              }
              router.refresh();
            }
          }

          if (event.type === "copilot_output" && event.payload) {
            onOutputEvent?.(event.payload);
          }

          if (event.type === "turn_complete" && event.summary) {
            setMessages((prev) => [
              ...prev,
              {
                id: `turn-${Date.now()}`,
                role: "system",
                content: `✓ Turn complete — ${event.summary}`,
              },
            ]);
            router.refresh();
          }

          if (event.type === "aborted") {
            setMessages((prev) => [
              ...prev,
              {
                id: `abort-${Date.now()}`,
                role: "system",
                content: event.message ?? "Stopped.",
              },
            ]);
            if (event.inFlightNote) {
              setAbortNote(event.inFlightNote);
            }
            router.refresh();
          }

          if (event.type === "error" && event.message) {
            setMessages((prev) => [
              ...prev,
              { id: `err-${Date.now()}`, role: "assistant", content: event.message! },
            ]);
            if ("insufficientCredits" in event && event.insufficientCredits) {
              router.refresh();
            }
          }

          if (event.type === "done") {
            router.refresh();
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Co-pilot failed.",
        },
      ]);
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function insertMention(ingredient: MentionIngredient) {
    setInput((prev) => `${prev}@${ingredient.ref_tag} `);
    setMentionOpen(false);
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className ?? ""}`}>
      <div
        ref={messageLogRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
      >
        {messageBanner ? <div className="space-y-3">{messageBanner}</div> : null}
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Your production partner — ask anything about this series, rewrite scenes, generate storyboards,
            or say &ldquo;generate it&rdquo;. Context updates live as you work.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                message.role === "user"
                  ? "border-border bg-surface-elevated"
                  : message.role === "tool"
                    ? "border-accent/30 bg-accent-muted/10 font-mono text-xs"
                    : message.role === "system"
                      ? "border-emerald-500/30 bg-emerald-500/5 text-xs"
                      : "border-border bg-background"
              }`}
            >
              {message.role === "tool" ? (
                <div>
                  <p className={toolMessageClass(message)}>
                    {message.content}
                    {message.tool_status === "running" && message.step && message.total ? (
                      <span className="ml-2 text-muted">({message.step}/{message.total})</span>
                    ) : null}
                  </p>
                  {message.tool_result && message.tool_status === "done" ? (
                    <pre className="mt-2 overflow-x-auto text-[10px] text-muted">
                      {JSON.stringify(message.tool_result, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-border bg-surface pt-3">
        <select
          value={copilotModel}
          onChange={(e) => setCopilotModel(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        >
          {ANTHROPIC_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <div className="relative">
          {mentionOpen ? (
            <div className="absolute bottom-full left-0 z-10 mb-2 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-lg">
              {ingredients.map((ingredient) => (
                <button
                  key={ingredient.id}
                  type="button"
                  onClick={() => insertMention(ingredient)}
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-accent-muted/30"
                >
                  @{ingredient.ref_tag} {ingredient.name}
                </button>
              ))}
            </div>
          ) : null}

          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.endsWith("@")) setMentionOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={3}
            placeholder="Plan the episode, revise a breakdown, or approve building segments…"
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={streaming}
          />
        </div>

        {abortNote ? (
          <p className="text-xs text-amber-400">{abortNote}</p>
        ) : null}

        <div className="flex gap-2">
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex-1 rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-foreground"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={streaming || !input.trim()}
            className={`rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${streaming ? "flex-1" : "w-full"}`}
          >
            {streaming ? "Working…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
