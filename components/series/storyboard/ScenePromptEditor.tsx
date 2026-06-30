"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
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

export type ScenePromptEditorHandle = {
  insertIngredient: (ingredient: MentionIngredient) => void;
  insertSheet: (sheet: MentionSheet) => void;
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
  onPromptChange?: (prompt: string) => void;
}

export const ScenePromptEditor = forwardRef<ScenePromptEditorHandle, ScenePromptEditorProps>(
  function ScenePromptEditor(
    {
      sceneId,
      episodeId,
      seriesId,
      initialPrompt,
      ingredients,
      sheets,
      boundSheetIds,
      resolvedReferences,
      onPromptChange,
    },
    ref,
  ) {
    const router = useRouter();
    const [prompt, setPrompt] = useState(initialPrompt);
    const [showPicker, setShowPicker] = useState(false);
    const [filter, setFilter] = useState("");
    const [pending, startTransition] = useTransition();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      setPrompt(initialPrompt);
    }, [initialPrompt]);

    useEffect(() => {
      onPromptChange?.(prompt);
    }, [prompt, onPromptChange]);

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

    function insertToken(token: string): string {
      const textarea = textareaRef.current;
      if (!textarea) {
        const spacer = prompt && !prompt.endsWith(" ") && !prompt.endsWith("\n") ? " " : "";
        return `${prompt}${spacer}${token}`;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = prompt.slice(0, start);
      const after = prompt.slice(end);
      const spacer = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
      const next = `${before}${spacer}${token}${after}`;

      const cursor = before.length + spacer.length + token.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });

      return next;
    }

    function applyPrompt(next: string, persist: () => Promise<void>) {
      setPrompt(next);
      setShowPicker(false);
      startTransition(async () => {
        await persist();
        router.refresh();
      });
      textareaRef.current?.focus();
    }

    function selectSheet(sheet: MentionSheet) {
      const next = prompt.endsWith("@")
        ? prompt.replace(/@$/, `@sheet:${sheet.label} `)
        : insertToken(`@sheet:${sheet.label} `);

      applyPrompt(next, async () => {
        await bindSheetAction(sceneId, sheet.id, seriesId, episodeId);
        await updateSceneAction(sceneId, episodeId, seriesId, { prompt: next });
      });
    }

    function selectMention(ingredient: MentionIngredient) {
      const next = prompt.endsWith("@")
        ? prompt.replace(/@$/, `${ingredient.ref_tag} `)
        : insertToken(`${ingredient.ref_tag} `);

      applyPrompt(next, async () => {
        await bindMentionAction(sceneId, ingredient.id, episodeId, seriesId);
        await updateSceneAction(sceneId, episodeId, seriesId, { prompt: next });
      });
    }

    useImperativeHandle(ref, () => ({
      insertIngredient: selectMention,
      insertSheet: selectSheet,
    }));

    function handleChange(value: string) {
      setPrompt(value);
      if (value.endsWith("@")) {
        setShowPicker(true);
        setFilter("");
      }
    }

    function savePrompt() {
      startTransition(async () => {
        const result = await updateSceneAction(sceneId, episodeId, seriesId, { prompt });
        if (result.error) alert(result.error);
        else router.refresh();
      });
    }

    return (
      <div className="space-y-5">
        <SceneReferencesPanel
          resolvedReferences={resolvedReferences}
          boundSheetIds={boundSheetIds}
        />

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
  },
);
