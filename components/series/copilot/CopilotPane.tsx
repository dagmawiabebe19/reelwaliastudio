"use client";

import { useEffect, useRef, useState } from "react";
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
} from "@/lib/ai/anthropic-models";
import type { ModelCatalogEntry } from "@/components/series/generation/GenerationPanel";

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_name?: string | null;
  tool_args?: Record<string, unknown> | null;
  tool_result?: Record<string, unknown> | null;
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
  scenes?: Array<{ id: string; title: string; prompt: string | null; act_label: string | null }>;
  ingredients?: Array<{ id: string; ref_tag: string; name: string; kind: string }>;
};

interface CopilotPaneProps {
  scopeType: "series" | "episode" | "scene";
  scopeId: string;
  context: CopilotContextPayload;
  imageModels: ModelCatalogEntry[];
  ingredients: MentionIngredient[];
  initialMessages?: ChatMessageData[];
}

export function CopilotPane({
  scopeType,
  scopeId,
  context,
  imageModels,
  ingredients,
  initialMessages = [],
}: CopilotPaneProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copilotModel, setCopilotModel] = useState<string>(DEFAULT_ANTHROPIC_MODEL);
  const [imageModel, setImageModel] = useState(imageModels.find((m) => m.configured)?.id ?? "");
  const [mentionOpen, setMentionOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text },
    ]);

    let assistantBuffer = "";
    const assistantId = `assistant-${Date.now()}`;

    try {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType,
          scopeId,
          message: text,
          modelId: copilotModel,
          context: {
            ...context,
            preferredImageModel: imageModel,
          },
        }),
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
            name?: string;
            args?: Record<string, unknown>;
            result?: Record<string, unknown>;
            message?: string;
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

          if (event.type === "tool_start" && event.name) {
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-${event.name}-${Date.now()}`,
                role: "tool",
                content: `TOOL ${event.name} …`,
                tool_name: event.name,
                tool_args: event.args ?? null,
              },
            ]);
          }

          if (event.type === "tool_done" && event.name) {
            setMessages((prev) =>
              prev.map((m) =>
                m.tool_name === event.name && m.content.endsWith("…")
                  ? {
                      ...m,
                      content: `TOOL ${event.name} DONE`,
                      tool_result: event.result ?? null,
                    }
                  : m,
              ),
            );
          }

          if (event.type === "error" && event.message) {
            setMessages((prev) => [
              ...prev,
              { id: `err-${Date.now()}`, role: "assistant", content: event.message! },
            ]);
          }
        }
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Co-pilot failed.",
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  function insertMention(ingredient: MentionIngredient) {
    setInput((prev) => `${prev}@${ingredient.ref_tag} `);
    setMentionOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pr-2">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Ask the co-pilot to draft storyboards, add ingredients, bind identity locks, or generate takes.
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
                    : "border-border bg-background"
              }`}
            >
              {message.role === "tool" ? (
                <div>
                  <p className="text-accent">{message.content}</p>
                  {message.tool_result ? (
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
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={copilotModel}
            onChange={(e) => setCopilotModel(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={imageModel}
            onChange={(e) => setImageModel(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {imageModels.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.configured}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

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
            placeholder="Message co-pilot… type @ to add ingredients"
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {streaming ? "Streaming…" : "Send"}
        </button>
      </div>
    </div>
  );
}
