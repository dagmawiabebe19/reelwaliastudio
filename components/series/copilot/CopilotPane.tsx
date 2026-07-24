"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { noteStudioRender } from "@/lib/debug/studio-render-count";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

/** Cap rendered transcript rows — older history stays in state but is not markdown-rendered. */
const MAX_RENDERED_MESSAGES = 60;
/** Treat a hung SSE turn as terminal so the UI stops streaming UI work. */
const STREAM_STALL_MS = 12 * 60 * 1000;
const REFRESH_COALESCE_MS = 500;

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

const MemoizedChatRow = memo(function MemoizedChatRow({
  message,
}: {
  message: ChatMessageData;
}) {
  return (
    <div
      data-copilot-message-id={message.id}
      className={`rounded-lg border px-3 py-2 text-sm ${
        message.role === "user"
          ? "border-border bg-surface-elevated"
          : message.role === "system"
            ? "border-border/60 bg-surface/60 text-xs text-muted"
            : "border-border bg-background"
      }`}
    >
      {message.role === "assistant" ? (
        <CopilotMessageContent content={message.content} />
      ) : (
        <p className="whitespace-pre-wrap">{message.content}</p>
      )}
    </div>
  );
});

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

/** Distance from bottom (px) to treat the user as "following" new messages. */
const CHAT_PIN_THRESHOLD_PX = 48;

function isChatNearBottom(log: HTMLDivElement): boolean {
  return log.scrollHeight - log.scrollTop - log.clientHeight <= CHAT_PIN_THRESHOLD_PX;
}

function scrollChatToBottom(log: HTMLDivElement): void {
  log.scrollTop = log.scrollHeight;
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
  noteStudioRender("CopilotPane");
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
  const pinnedToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);

  const scheduleStudioRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      router.refresh();
    }, REFRESH_COALESCE_MS);
  }, [router]);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current != null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const { displayMessages } = useMemo(() => partitionMessages(messages), [messages]);
  const renderedMessages = useMemo(
    () =>
      displayMessages.length > MAX_RENDERED_MESSAGES
        ? displayMessages.slice(-MAX_RENDERED_MESSAGES)
        : displayMessages,
    [displayMessages],
  );

  const statusContext = useMemo(
    () => ({ ingredients: ingredients.map((item) => ({ id: item.id, name: item.name })) }),
    [ingredients],
  );

  function handleStop() {
    abortRef.current?.abort();
    clearStallTimer();
    setStreaming(false);
  }

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
      clearStallTimer();
    };
  }, [clearStallTimer]);

  useEffect(() => {
    if (!copilotDraft?.trim()) return;
    setInput(copilotDraft);
    setCopilotDraft(null);
  }, [copilotDraft, setCopilotDraft]);

  const pinChatToBottomIfFollowing = useCallback(() => {
    const log = messageLogRef.current;
    if (!log || !pinnedToBottomRef.current) return;
    scrollChatToBottom(log);
  }, []);

  useEffect(() => {
    const log = messageLogRef.current;
    if (!log) return;

    const onScroll = () => {
      pinnedToBottomRef.current = isChatNearBottom(log);
    };

    log.addEventListener("scroll", onScroll, { passive: true });
    return () => log.removeEventListener("scroll", onScroll);
  }, []);

  // First load / episode switch: start at latest message.
  useEffect(() => {
    pinnedToBottomRef.current = true;
    requestAnimationFrame(() => pinChatToBottomIfFollowing());
  }, [scopeType, scopeId, pinChatToBottomIfFollowing]);

  // Pin while following as messages grow (send, stream tokens, tool updates in log).
  useEffect(() => {
    requestAnimationFrame(() => pinChatToBottomIfFollowing());
  }, [displayMessages, streaming, pinChatToBottomIfFollowing]);

  // Only observe resizes while streaming — observing always turns markdown reflow into scroll thrash.
  useEffect(() => {
    if (!streaming) return;
    const log = messageLogRef.current;
    if (!log || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const observer = new ResizeObserver(() => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        pinChatToBottomIfFollowing();
      });
    });
    observer.observe(log);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [streaming, pinChatToBottomIfFollowing]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);
    setAbortNote(null);
    setLiveTurnTools([]);
    pinnedToBottomRef.current = true;
    abortRef.current = new AbortController();
    clearStallTimer();
    stallTimerRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      setStreaming(false);
      setLiveTurnTools([]);
      setAbortNote("Co-pilot turn stalled — stopped waiting for the stream.");
      scheduleStudioRefresh();
    }, STREAM_STALL_MS);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text },
    ]);
    requestAnimationFrame(() => pinChatToBottomIfFollowing());

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

      if (!response.ok) {
        let message = "Co-pilot request failed.";
        try {
          const body = (await response.json()) as { error?: string };
          if (typeof body.error === "string" && body.error.trim()) {
            message = body.error.trim();
          } else if (response.status === 429) {
            message = "Too many requests — wait a moment and try again.";
          }
        } catch {
          if (response.status === 429) {
            message = "Too many requests — wait a moment and try again.";
          }
        }
        throw new Error(message);
      }

      if (!response.body) {
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
              scheduleStudioRefresh();
            }
          }

          if (event.type === "copilot_output" && event.payload) {
            onOutputEvent?.(event.payload);
          }

          if (event.type === "turn_complete" && event.summary) {
            scheduleStudioRefresh();
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
            scheduleStudioRefresh();
          }

          if (event.type === "error" && event.message) {
            setMessages((prev) => [
              ...prev,
              { id: `err-${Date.now()}`, role: "assistant", content: event.message! },
            ]);
            if ("insufficientCredits" in event && event.insufficientCredits) {
              scheduleStudioRefresh();
            }
          }

          if (event.type === "done") {
            scheduleStudioRefresh();
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
      clearStallTimer();
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
        {renderedMessages.length === 0 ? (
          <p className="text-sm text-muted">
            Your production partner — ask anything about this series, rewrite scenes, generate storyboards,
            or say &ldquo;generate it&rdquo;. Context updates live as you work.
          </p>
        ) : (
          renderedMessages.map((message) => (
            <MemoizedChatRow key={message.id} message={message} />
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
