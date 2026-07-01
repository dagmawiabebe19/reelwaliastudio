import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

const CALLOUT_PATTERN = /^⚠️\s*(.+)$/;

export function parsePromptCallouts(prompt: string) {
  const lines = prompt.split("\n");
  const blocks: { type: "text" | "callout"; content: string; label?: string }[] = [];
  let buffer: string[] = [];

  function flushText() {
    if (buffer.length > 0) {
      blocks.push({ type: "text", content: buffer.join("\n") });
      buffer = [];
    }
  }

  for (const line of lines) {
    const match = line.match(CALLOUT_PATTERN);
    if (match) {
      flushText();
      blocks.push({ type: "callout", content: line, label: match[1] });
    } else {
      buffer.push(line);
    }
  }
  flushText();
  return blocks;
}

export function ProductionNoteChips({ prompt }: { prompt: string }) {
  const callouts = parsePromptCallouts(prompt).filter((block) => block.type === "callout");
  if (!callouts.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {callouts.map((block, index) => (
        <span key={index} className="studio-production-chip" title={block.label}>
          {block.label}
        </span>
      ))}
    </div>
  );
}

export function SceneCalloutPreview({ prompt }: { prompt: string }) {
  const blocks = parsePromptCallouts(prompt);
  if (!prompt.trim()) {
    return (
      <EmptyState
        variant="inline"
        icon={FileText}
        title="No prompt yet"
        description="Describe the shot in the editor — use @mentions to bind references."
      />
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) =>
        block.type === "callout" ? (
          <span key={index} className="studio-production-chip">
            {block.label}
          </span>
        ) : block.content.trim() ? (
          <p key={index} className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {block.content}
          </p>
        ) : null,
      )}
    </div>
  );
}
