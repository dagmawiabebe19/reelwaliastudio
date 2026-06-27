"use client";

import { useMemo, useState, useTransition } from "react";
import { appendSeriesMemoryEntryAction } from "@/app/(app)/series/[id]/actions";
import type { ChatMessageData } from "@/components/series/copilot/CopilotPane";

const CANON_PATTERN = /save this as canon/i;

interface CanonMemoryPromptProps {
  seriesId: string;
  messages: ChatMessageData[];
  onSaved: () => void;
}

export function CanonMemoryPrompt({ seriesId, messages, onSaved }: CanonMemoryPromptProps) {
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState<string | null>(null);

  const proposal = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.content || !CANON_PATTERN.test(lastAssistant.content)) return null;
    if (dismissed === lastAssistant.id) return null;
    const lastUser = [...messages]
      .slice(
        0,
        messages.findIndex((m) => m.id === lastAssistant.id),
      )
      .reverse()
      .find((m) => m.role === "user");
    const entry = lastUser?.content?.trim();
    if (!entry) return null;
    return { assistant: lastAssistant, entry };
  }, [messages, dismissed]);

  if (!proposal) return null;

  return (
    <div className="mb-3 rounded-md border border-accent/30 bg-accent-muted/10 px-3 py-2 text-xs">
      <p className="text-foreground">Save to Series Memory as canon?</p>
      <p className="mt-1 text-muted">&ldquo;{proposal.entry}&rdquo;</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await appendSeriesMemoryEntryAction(seriesId, proposal.entry, "world");
              setDismissed(proposal.assistant.id);
              onSaved();
            });
          }}
          className="rounded bg-accent px-2 py-1 text-white disabled:opacity-50"
        >
          Save as canon
        </button>
        <button
          type="button"
          onClick={() => setDismissed(proposal.assistant.id)}
          className="rounded border border-border px-2 py-1 text-muted"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
