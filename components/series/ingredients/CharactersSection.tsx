"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCharacterSheetAction,
  getCharacterSheetDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import {
  createCharacterSheetAction,
  generateCharacterAction,
  generateCostumeAction,
} from "@/app/(app)/series/[id]/production-actions";
import { IngredientDeleteButton } from "@/components/series/ingredients/IngredientDeleteButton";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { RefTag } from "@/components/ui/RefTag";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { StatusDot } from "@/components/ui/StatusDot";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import { SHEET_ANGLE_LABELS } from "@/lib/production/prompts";
import type { CharacterSheetCardData, EpisodeOption, IngredientCardData } from "@/lib/production/types";

interface CharactersSectionProps {
  seriesId: string;
  characters: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  episodes: EpisodeOption[];
}

function GenerationBadge({ status }: { status?: string | null }) {
  if (!status || status === "ready") return null;
  const variant =
    status === "pending" ? "in_progress" : status === "failed" ? "open" : "validated";
  return <StatusDot variant={variant} label={status} />;
}

export function CharactersSection({
  seriesId,
  characters,
  costumesByCharacter,
  sheetsByCharacter,
  episodes,
}: CharactersSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);

  const hasPending =
    characters.some((c) => c.generationStatus === "pending") ||
    Object.values(costumesByCharacter)
      .flat()
      .some((c) => c.generationStatus === "pending") ||
    Object.values(sheetsByCharacter)
      .flat()
      .some((s) => s.status === "pending");

  usePollWhilePending(hasPending);

  function runAction(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="font-display text-xl text-foreground">
          Characters <span className="text-muted">({characters.length})</span>
        </h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runAction(() => generateCharacterAction(seriesId, new FormData(e.currentTarget)));
          }}
        >
          <input
            name="name"
            required
            placeholder="Name"
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          />
          <input
            name="description"
            required
            placeholder="Appearance description…"
            className="min-w-[14rem] rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Generate from description
          </button>
        </form>
      </div>

      {error ? (
        <p className="rounded-md border border-accent/40 bg-accent-muted/30 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {characters.length === 0 ? (
        <p className="text-sm text-muted">No characters yet. Generate one from a description above.</p>
      ) : (
        <div className="space-y-8">
          {characters.map((character) => {
            const costumes = costumesByCharacter[character.id] ?? [];
            const sheets = sheetsByCharacter[character.id] ?? [];

            return (
              <article
                key={character.id}
                className="overflow-hidden rounded-lg border border-border bg-surface-elevated"
              >
                <div className="grid gap-4 p-4 md:grid-cols-[10rem_1fr]">
                  <div className="aspect-[3/4] overflow-hidden rounded-md bg-background">
                    {character.assetUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={character.assetUrl}
                        alt={character.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">
                        {character.generationStatus === "pending" ? "Generating…" : "No headshot"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-medium text-foreground">{character.name}</h3>
                      <RefTag tag={character.ref_tag} />
                      <GenerationBadge status={character.generationStatus} />
                      <IngredientDeleteButton
                        ingredientId={character.id}
                        seriesId={seriesId}
                      />
                    </div>
                    {character.description ? (
                      <p className="text-sm text-muted">{character.description}</p>
                    ) : null}
                    <GenerationStatusLine
                      status={character.generationStatus}
                      error={character.generationError}
                    />

                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs uppercase tracking-widest text-muted">Costumes</p>
                      <form
                        className="flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          fd.set("characterId", character.id);
                          runAction(() => generateCostumeAction(seriesId, fd));
                        }}
                      >
                        <input type="hidden" name="characterId" value={character.id} />
                        <input
                          name="name"
                          required
                          placeholder="Costume name"
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                        />
                        <input
                          name="description"
                          required
                          placeholder="Wardrobe description…"
                          className="min-w-[12rem] flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={pending || character.generationStatus !== "ready"}
                          className="text-sm text-accent hover:underline disabled:opacity-50"
                        >
                          Generate costume preview
                        </button>
                      </form>
                      {costumes.length === 0 ? (
                        <p className="text-xs text-muted">No costumes yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {costumes.map((costume) => (
                            <div
                              key={costume.id}
                              className="relative w-28 overflow-hidden rounded border border-border"
                            >
                              <div className="absolute right-0 top-0 z-10">
                                <IngredientDeleteButton
                                  ingredientId={costume.id}
                                  seriesId={seriesId}
                                />
                              </div>
                              <div className="aspect-[3/4] bg-background">
                                {costume.assetUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={costume.assetUrl}
                                    alt={costume.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-[10px] text-muted">
                                    {costume.generationStatus === "pending" ? "…" : "—"}
                                  </div>
                                )}
                              </div>
                              <div className="p-1.5">
                                <p className="truncate text-xs">{costume.name}</p>
                                <RefTag tag={costume.ref_tag} />
                                <GenerationStatusLine
                                  status={costume.generationStatus}
                                  error={costume.generationError}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-border pt-3">
                      <p className="text-xs uppercase tracking-widest text-muted">Character sheets</p>
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          fd.set("characterId", character.id);
                          runAction(() => createCharacterSheetAction(seriesId, fd));
                        }}
                      >
                        <input type="hidden" name="characterId" value={character.id} />
                        <input
                          name="name"
                          required
                          placeholder="Sheet name"
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                        />
                        <select
                          name="costumeId"
                          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                          defaultValue=""
                        >
                          <option value="">No costume (base)</option>
                          {costumes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          name="episodeIds"
                          multiple
                          className="min-w-[10rem] rounded-md border border-border bg-background px-2 py-1 text-sm"
                        >
                          {episodes.map((ep) => (
                            <option key={ep.id} value={ep.id}>
                              {ep.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          disabled={pending || character.generationStatus !== "ready"}
                          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                        >
                          Generate sheet
                        </button>
                      </form>
                      <p className="text-[10px] text-muted">
                        Hold ⌘/Ctrl to select multiple episodes. One sheet applies across all selected episodes.
                      </p>

                      {sheets.length === 0 ? (
                        <p className="text-xs text-muted">No sheets yet.</p>
                      ) : (
                        <div className="space-y-4">
                          {sheets.map((sheet) => (
                            <div key={sheet.id} className="rounded border border-border bg-background p-3">
                              <div className="flex w-full items-center justify-between text-left text-sm">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSheet(expandedSheet === sheet.id ? null : sheet.id)
                                  }
                                  className="flex flex-1 items-center justify-between"
                                >
                                  <span>
                                    {sheet.name}
                                    {sheet.costume_name ? ` · ${sheet.costume_name}` : ""}
                                  </span>
                                  <GenerationBadge status={sheet.status} />
                                </button>
                                <DeleteConfirmButton
                                  ariaLabel="Delete character sheet"
                                  fetchPreview={() =>
                                    getCharacterSheetDeletePreviewAction(sheet.id, seriesId)
                                  }
                                  onDelete={() => deleteCharacterSheetAction(sheet.id, seriesId)}
                                  onSuccess={() => router.refresh()}
                                />
                              </div>
                              <GenerationStatusLine
                                status={sheet.status}
                                error={sheet.generation_error}
                              />
                              {sheet.status === "pending" ? (
                                <p className="mt-1 text-[10px] text-muted">
                                  Rendering 5 angles — check back shortly
                                </p>
                              ) : null}
                              {expandedSheet === sheet.id || sheet.status === "ready" ? (
                                <div className="mt-3 flex gap-1 overflow-x-auto">
                                  {(
                                    [
                                      "front",
                                      "left_profile",
                                      "right_profile",
                                      "three_quarter",
                                      "back",
                                    ] as const
                                  ).map((angle) => (
                                    <div key={angle} className="w-20 shrink-0">
                                      <div className="aspect-[3/4] overflow-hidden rounded bg-surface">
                                        {sheet.angleUrls[angle] ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={sheet.angleUrls[angle]!}
                                            alt={SHEET_ANGLE_LABELS[angle]}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-[9px] text-muted">
                                            {sheet.status === "pending" ? "…" : "—"}
                                          </div>
                                        )}
                                      </div>
                                      <p className="mt-0.5 text-center text-[9px] text-muted">
                                        {SHEET_ANGLE_LABELS[angle]}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
