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

export function SceneCalloutPreview({ prompt }: { prompt: string }) {
  const blocks = parsePromptCallouts(prompt);
  if (!prompt.trim()) return <p className="text-sm text-muted">No prompt yet.</p>;

  return (
    <div className="space-y-3">
      {blocks.map((block, index) =>
        block.type === "callout" ? (
          <div
            key={index}
            className="rounded-md border border-accent/40 bg-accent-muted/30 px-4 py-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              {block.label}
            </p>
          </div>
        ) : (
          <p key={index} className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {block.content}
          </p>
        ),
      )}
    </div>
  );
}
