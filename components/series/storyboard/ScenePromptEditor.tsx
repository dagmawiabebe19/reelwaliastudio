"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bindMentionAction,
  updateSceneAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import { RefTag } from "@/components/ui/RefTag";
import { SceneCalloutPreview } from "@/components/series/storyboard/SceneCalloutPreview";

export type MentionIngredient = {
  id: string;
  ref_tag: string;
  name: string;
};

interface ScenePromptEditorProps {
  sceneId: string;
  episodeId: string;
  seriesId: string;
  initialPrompt: string;
  ingredients: MentionIngredient[];
  boundIngredientIds: string[];
}

export function ScenePromptEditor({
  sceneId,
  episodeId,
  seriesId,
  initialPrompt,
  ingredients,
  boundIngredientIds,
}: ScenePromptEditorProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const filtered = ingredients.filter(
    (i) =>
      i.ref_tag.toLowerCase().includes(filter.toLowerCase()) ||
      i.name.toLowerCase().includes(filter.toLowerCase()),
  );

  function handleChange(value: string) {
    setPrompt(value);
    if (value.endsWith("@")) {
      setShowPicker(true);
      setFilter("");
    }
  }

  function selectMention(ingredient: MentionIngredient) {
    const textarea = textareaRef.current;
    const next = prompt.replace(/@$/, `${ingredient.ref_tag} `);
    setPrompt(next);
    setShowPicker(false);

    startTransition(async () => {
      await bindMentionAction(sceneId, ingredient.id, episodeId, seriesId);
      await updateSceneAction(sceneId, episodeId, seriesId, { prompt: next });
      router.refresh();
    });

    textarea?.focus();
  }

  function savePrompt() {
    startTransition(async () => {
      const result = await updateSceneAction(sceneId, episodeId, seriesId, { prompt });
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  const boundChips = ingredients.filter((i) => boundIngredientIds.includes(i.id));

  return (
    <div className="space-y-4">
      {boundChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {boundChips.map((chip) => (
            <RefTag key={chip.id} tag={chip.ref_tag} />
          ))}
        </div>
      ) : null}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => handleChange(e.target.value)}
          rows={10}
          placeholder="Scene prompt… Type @ to bind an ingredient identity lock."
          className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 font-mono text-sm leading-relaxed focus-ring focus:ring-2 focus:ring-ring"
        />
        {showPicker ? (
          <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-lg">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search ingredients…"
              className="w-full border-b border-border bg-transparent px-3 py-2 text-sm focus:outline-none"
            />
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectMention(item)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent-muted"
              >
                <span>{item.name}</span>
                <RefTag tag={item.ref_tag} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={savePrompt}
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save prompt"}
      </button>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted">Preview</p>
        <SceneCalloutPreview prompt={prompt} />
      </div>
    </div>
  );
}
