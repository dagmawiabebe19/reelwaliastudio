"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import { updateSeriesBriefAction } from "@/app/(app)/series/[id]/actions";
import { Button } from "@/components/ui/Button";

interface SeriesBriefEditorProps {
  seriesId: string;
  initialMarkdown: string;
}

export function SeriesBriefEditor({ seriesId, initialMarkdown }: SeriesBriefEditorProps) {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [savedMarkdown, setSavedMarkdown] = useState(initialMarkdown);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isDirty = markdown !== savedMarkdown;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSeriesBriefAction(seriesId, markdown);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedMarkdown(markdown);
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-foreground">Series Brief</h2>
          <p className="mt-1 text-sm text-muted">
            Production brief for this series — markdown supported.
          </p>
        </div>
        <Button type="button" onClick={handleSave} disabled={pending || !isDirty}>
          {pending ? "Saving…" : "Save brief"}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label htmlFor="brief-markdown" className="mb-2 block text-xs uppercase tracking-widest text-muted">
            Edit
          </label>
          <textarea
            id="brief-markdown"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            rows={18}
            className="w-full resize-y rounded-lg border border-border bg-surface-elevated px-4 py-3 font-mono text-sm leading-relaxed text-foreground focus-ring focus:ring-2 focus:ring-ring"
            placeholder="Describe the series premise, tone, visual language…"
          />
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted">Preview</p>
          <article className="prose-brief min-h-[28rem] rounded-lg border border-border bg-surface px-6 py-5">
            {savedMarkdown.trim() ? (
              <ReactMarkdown>{savedMarkdown}</ReactMarkdown>
            ) : (
              <p className="text-sm text-muted">Nothing to preview yet.</p>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
