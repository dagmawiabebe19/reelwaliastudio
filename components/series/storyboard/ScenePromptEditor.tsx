"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bindMentionAction,
  updateSceneAction,
} from "@/app/(app)/series/[id]/episodes/[episodeId]/actions";
import { bindSheetAction } from "@/app/(app)/series/[id]/production-actions";
import { RefTag } from "@/components/ui/RefTag";
import { ProductionNoteChips } from "@/components/series/storyboard/SceneCalloutPreview";
import { SceneReferencesPanel } from "@/components/series/storyboard/SceneReferencesPanel";
import type { MentionSheet } from "@/lib/production/types";
import type { ResolvedReference } from "@/lib/production/types";

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
  sheets: MentionSheet[];
  boundIngredientIds: string[];
  boundSheetIds: string[];
  resolvedReferences: ResolvedReference[];
}

export function ScenePromptEditor({
  sceneId,
  episodeId,
  seriesId,
  initialPrompt,
  ingredients,
  sheets,
  boundIngredientIds,
  boundSheetIds,
  resolvedReferences,
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

  const readySheets = sheets.filter((s) => s.status === "ready");
  const filteredSheets = readySheets.filter(
    (s) =>
      s.label.toLowerCase().includes(filter.toLowerCase()) ||
      s.character_name.toLowerCase().includes(filter.toLowerCase()),
  );
  const filteredIngredients = ingredients.filter(
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

  function selectSheet(sheet: MentionSheet) {
    const next = prompt.replace(/@$/, `@sheet:${sheet.label} `);
    setPrompt(next);
    setShowPicker(false);

    startTransition(async () => {
      await bindSheetAction(sceneId, sheet.id, seriesId, episodeId);
      await updateSceneAction(sceneId, episodeId, seriesId, { prompt: next });
      router.refresh();
    });

    textareaRef.current?.focus();
  }

  function selectMention(ingredient: MentionIngredient) {
    const next = prompt.replace(/@$/, `${ingredient.ref_tag} `);
    setPrompt(next);
    setShowPicker(false);

    startTransition(async () => {
      await bindMentionAction(sceneId, ingredient.id, episodeId, seriesId);
      await updateSceneAction(sceneId, episodeId, seriesId, { prompt: next });
      router.refresh();
    });

    textareaRef.current?.focus();
  }

  function savePrompt() {
    startTransition(async () => {
      const result = await updateSceneAction(sceneId, episodeId, seriesId, { prompt });
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  const boundChips = [
    ...sheets.filter((s) => boundSheetIds.includes(s.id)).map((s) => ({ id: s.id, tag: s.label })),
    ...ingredients
      .filter((i) => boundIngredientIds.includes(i.id))
      .map((i) => ({ id: i.id, tag: i.ref_tag })),
  ];

  return (
    <div className="space-y-5">
      <SceneReferencesPanel
        resolvedReferences={resolvedReferences}
        boundSheetIds={boundSheetIds}
      />

      {boundChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {boundChips.map((chip) => (
            <RefTag key={chip.id} tag={chip.tag} />
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="studio-section-label">Shot description</p>
          <button
            type="button"
            onClick={savePrompt}
            disabled={pending}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save prompt"}
          </button>
        </div>

        <ProductionNoteChips prompt={prompt} />

        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => handleChange(e.target.value)}
            rows={8}
            placeholder="Describe the shot… Type @ to bind a character sheet or ingredient."
            className="studio-prompt-editor w-full px-4 py-3 focus-ring"
          />
          {showPicker ? (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-lg">
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search sheets & ingredients…"
                className="w-full border-b border-border bg-transparent px-3 py-2 text-sm focus:outline-none"
              />
              {filteredSheets.length > 0 ? (
                <p className="px-3 py-1 studio-section-label">Character sheets</p>
              ) : null}
              {filteredSheets.map((sheet) => (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => selectSheet(sheet)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent-muted/20"
                >
                  <span>
                    {sheet.character_name}
                    {sheet.costume_name ? ` · ${sheet.costume_name}` : ""} — {sheet.label}
                  </span>
                  <span className="text-xs text-muted">sheet</span>
                </button>
              ))}
              {filteredIngredients.length > 0 ? (
                <p className="px-3 py-1 studio-section-label">Ingredients</p>
              ) : null}
              {filteredIngredients.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectMention(item)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent-muted/20"
                >
                  <span>{item.name}</span>
                  <RefTag tag={item.ref_tag} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
