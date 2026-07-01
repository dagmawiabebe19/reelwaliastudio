"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Send, Square } from "lucide-react";
import { useCopilotWorkspace } from "@/components/copilot/CopilotWorkspaceProvider";
import { writeHighlightSegments } from "@/lib/storyboard/episode-buckets";
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
} from "@/lib/ai/anthropic-models";

import type { CopilotOutputEvent } from "@/lib/copilot/output";
import { CopilotMessageContent } from "@/components/series/copilot/CopilotMessageContent";
import { CopilotToolActivity } from "@/components/series/copilot/CopilotToolActivity";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

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

function isTurnCompleteMessage(message: ChatMessageData): boolean {
  return message.role === "system" && message.content.startsWith("✓ Turn complete");
}

function partitionMessages(messages: ChatMessageData[]) {
  const displayMessages = messages.filter(
    (message) => message.role !== "tool" && !isTurnCompleteMessage(message),
  );
  return { displayMessages };
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
  const { copilotDraft, setCopilotDraft } = useCopilotWorkspace();
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
  const [liveTurnTools, setLiveTurnTools] = useState<ChatMessageData[]>([]);
  const messageLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingAssistantIdRef = useRef<string | null>(null);
  const wasStreamingRef = useRef(false);

  const { displayMessages } = useMemo(() => partitionMessages(messages), [messages]);

  const statusContext = useMemo(
    () => ({ ingredients: ingredients.map((item) => ({ id: item.id, name: item.name })) }),
    [ingredients],
  );

  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  useEffect(() => {
    if (!copilotDraft?.trim()) return;
    setInput(copilotDraft);
    setCopilotDraft(null);
  }, [copilotDraft, setCopilotDraft]);

  function scrollAssistantToTop(assistantId: string) {
    const log = messageLogRef.current;
    if (!log) return;
    const el = log.querySelector<HTMLElement>(`[data-copilot-message-id="${assistantId}"]`);
    if (!el) return;
    log.scrollTop = Math.max(0, el.offsetTop - log.offsetTop - 8);
  }

  useEffect(() => {
    const log = messageLogRef.current;
    if (!log) return;

    if (streaming) {
      wasStreamingRef.current = true;
      log.scrollTop = log.scrollHeight;
      return;
    }

    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      const assistantId = streamingAssistantIdRef.current;
      if (assistantId) {
        requestAnimationFrame(() => scrollAssistantToTop(assistantId));
      }
    }
  }, [messages, streaming]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);
    setAbortNote(null);
    setLiveTurnTools([]);
    abortRef.current = new AbortController();
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text },
    ]);
    requestAnimationFrame(() => {
      const log = messageLogRef.current;
      if (log) log.scrollTop = log.scrollHeight;
    });

    let assistantBuffer = "";
    const assistantId = `assistant-${Date.now()}`;
    streamingAssistantIdRef.current = assistantId;

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
          let event: {
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
            insufficientCredits?: { needed: number; available: number };
          };
          try {
            event = JSON.parse(line.slice(6)) as typeof event;
          } catch {
            continue;
          }

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
            const toolMessage: ChatMessageData = {
              id: event.toolId!,
              role: "tool",
              content: `TOOL ${event.name} — running…`,
              tool_name: event.name,
              tool_args: event.args ?? null,
              tool_status: "running",
            };
            setLiveTurnTools((prev) => [...prev, toolMessage]);
            setMessages((prev) => [...prev, toolMessage]);
          }

          if (event.type === "tool_progress" && event.toolId && event.message) {
            const patch = {
              content: event.message!,
              tool_status: "running" as const,
              step: event.step,
              total: event.total,
            };
            setLiveTurnTools((prev) =>
              prev.map((m) => (m.id === event.toolId ? { ...m, ...patch } : m)),
            );
            setMessages((prev) =>
              prev.map((m) => (m.id === event.toolId ? { ...m, ...patch } : m)),
            );
          }

          if (event.type === "tool_done" && event.toolId && event.name) {
            const patch = {
              content: event.summary ?? `TOOL ${event.name} DONE`,
              tool_result: event.result ?? null,
              tool_status: "done" as const,
              step: undefined,
              total: undefined,
            };
            setLiveTurnTools((prev) =>
              prev.map((m) => (m.id === event.toolId ? { ...m, ...patch } : m)),
            );
            setMessages((prev) =>
              prev.map((m) => (m.id === event.toolId ? { ...m, ...patch } : m)),
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
            router.refresh();
          }

          if (event.type === "aborted") {
            setLiveTurnTools([]);
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
        setLiveTurnTools([]);
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
        {displayMessages.length === 0 ? (
          <p className="text-sm text-muted">
            Your production partner — ask anything about this series, rewrite scenes, generate storyboards,
            or say &ldquo;generate it&rdquo;. Context updates live as you work.
          </p>
        ) : (
          displayMessages.map((message) => (
            <div
              key={message.id}
              data-copilot-message-id={message.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                message.role === "user"
                  ? "border-border bg-surface-elevated"
                  : message.role === "system"
                    ? "border-border/60 bg-surface/60 text-xs text-muted"
                    : "border-border bg-background"
              }`}
            >
              {message.role === "assistant" || message.role === "system" ? (
                message.role === "system" ? (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <CopilotMessageContent content={message.content} />
                )
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          ))
        )}
      </div>

      <CopilotToolActivity
        tools={liveTurnTools}
        streaming={streaming}
        statusContext={statusContext}
        onDismiss={() => setLiveTurnTools([])}
      />

      <div className="shrink-0 space-y-3 border-t border-border bg-surface pt-3">
        <select
          value={copilotModel}
          onChange={(e) => setCopilotModel(e.target.value)}
          className="studio-select !min-h-8 !py-1.5 !text-xs"
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
            className="studio-input resize-none !text-sm"
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
              className="focus-ring studio-btn studio-btn-secondary flex-1"
            >
              <Square className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
              Stop
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={streaming || !input.trim()}
            className={`focus-ring studio-btn studio-btn-primary disabled:opacity-50 ${streaming ? "flex-1" : "w-full"}`}
          >
            {streaming ? (
              "Working…"
            ) : (
              <>
                <Send className={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
