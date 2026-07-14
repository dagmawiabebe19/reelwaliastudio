"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shirt, User, Users } from "lucide-react";
import {
  cleanupFailedIngredientsAction,
  cleanupFailedSheetsForCharacterAction,
  deleteCharacterSheetAction,
  deleteIngredientWithCleanupAction,
  getCharacterSheetDeletePreviewAction,
  getIngredientDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import {
  createCharacterSheetAction,
  generateCharacterAction,
  generateCostumeAction,
  retryCharacterSheetAction,
  retryIngredientAction,
} from "@/app/(app)/series/[id]/production-actions";
import { FalSafeRestyleControls } from "@/components/series/ingredients/FalSafeRestyleControls";
import { InsufficientCreditsWall } from "@/components/credits/InsufficientCreditsWall";
import { CreditCostHint } from "@/components/credits/CreditCostHint";
import { IngredientDeleteButton } from "@/components/series/ingredients/IngredientDeleteButton";
import { FailedGenerationControls } from "@/components/series/ingredients/FailedGenerationControls";
import { estimateImageCredits, estimateSheetCredits } from "@/lib/credits/pricing";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { IngredientImagePanel } from "@/components/series/ingredients/IngredientImagePanel";
import { Lightbox, LightboxImageButton, useLightbox } from "@/components/ui/Lightbox";
import { RefTag } from "@/components/ui/RefTag";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { StatusDot } from "@/components/ui/StatusDot";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import { SHEET_ANGLE_LABELS } from "@/lib/production/prompts";
import {
  buildSheetLightboxGallery,
  sheetGalleryIndex,
  SHEET_GALLERY_ANGLES,
} from "@/lib/ui/lightbox-gallery";
import type { CharacterSheetCardData, EpisodeOption, IngredientCardData } from "@/lib/production/types";

interface CharactersSectionProps {
  seriesId: string;
  characters: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  episodes: EpisodeOption[];
  highlightSheetId?: string;
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
  highlightSheetId,
}: CharactersSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState<{
    needed: number;
    available: number;
  } | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);
  const lightbox = useLightbox();

  useEffect(() => {
    if (highlightSheetId) setExpandedSheet(highlightSheetId);
  }, [highlightSheetId]);

  const hasPending =
    characters.some((c) => c.generationStatus === "pending") ||
    Object.values(costumesByCharacter)
      .flat()
      .some((c) => c.generationStatus === "pending") ||
    Object.values(sheetsByCharacter)
      .flat()
      .some((s) => s.status === "pending");

  usePollWhilePending(hasPending);

  function runAction(action: () => Promise<Record<string, unknown>>) {
    setError(null);
    setInsufficientCredits(null);
    startTransition(async () => {
      const result = await action();
      const insufficient = result.insufficientCredits as
        | { needed: number; available: number }
        | undefined;
      if (insufficient) {
        setInsufficientCredits(insufficient);
      } else if (typeof result.error === "string") {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const hasFailedCharacters = characters.some((c) => c.generationStatus === "failed");
  const hasFailedCostumes = Object.values(costumesByCharacter)
    .flat()
    .some((c) => c.generationStatus === "failed");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="font-display text-xl text-foreground">
          Characters <span className="text-muted">({characters.length})</span>
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          {hasFailedCharacters || hasFailedCostumes ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const failedChars = characters.filter((c) => c.generationStatus === "failed").length;
                const failedCostumes = Object.values(costumesByCharacter)
                  .flat()
                  .filter((c) => c.generationStatus === "failed").length;
                const total = failedChars + failedCostumes;
                if (
                  !window.confirm(
                    `Remove ${total} failed character/costume item${total === 1 ? "" : "s"}?`,
                  )
                ) {
                  return;
                }
                runAction(async () => {
                  let deleted = 0;
                  if (failedChars > 0) {
                    const r = await cleanupFailedIngredientsAction(seriesId, "character");
                    if (typeof r.error === "string") return r;
                    deleted += r.deleted ?? 0;
                  }
                  if (failedCostumes > 0) {
                    const r = await cleanupFailedIngredientsAction(seriesId, "outfit");
                    if (typeof r.error === "string") return r;
                    deleted += r.deleted ?? 0;
                  }
                  return { deleted };
                });
              }}
              className="studio-btn studio-btn-ghost !min-h-7 !px-2 !py-1 !text-[10px]"
            >
              Clean up failed
            </button>
          ) : null}
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
          <CreditCostHint cost={estimateImageCredits(1)} available={null} />
        </form>
        </div>
      </div>

      {insufficientCredits ? (
        <InsufficientCreditsWall
          needed={insufficientCredits.needed}
          available={insufficientCredits.available}
        />
      ) : null}

      {error ? (
        <p className="rounded-md border border-accent/40 bg-accent-muted/30 px-3 py-2 text-sm text-accent">
          {error}
        </p>
      ) : null}

      {characters.length === 0 ? (
        <EmptyState
          variant="panel"
          icon={User}
          title="No characters yet"
          description="Describe a character above and generate a headshot, or ask the co-pilot to create one."
        />
      ) : (
        <div className="space-y-8">
          {characters.map((character) => {
            const costumes = costumesByCharacter[character.id] ?? [];
            const sheets = sheetsByCharacter[character.id] ?? [];

            return (
              <article
                key={character.id}
                id={`ingredient-${character.id}`}
                className="scroll-mt-24 overflow-hidden rounded-lg border border-border bg-surface-elevated"
              >
                <div className="grid gap-4 p-4 md:grid-cols-[10rem_1fr]">
                  <div className="aspect-[3/4] overflow-hidden rounded-md">
                    <IngredientImagePanel
                      ingredient={character}
                      seriesId={seriesId}
                      aspectClassName="h-full w-full"
                      onOpenGallery={lightbox.openGallery}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-medium text-foreground">{character.name}</h3>
                      <RefTag tag={character.ref_tag} />
                      <GenerationBadge status={character.generationStatus} />
                      {character.generationStatus === "failed" ? (
                        <FailedGenerationControls
                          size="md"
                          disabled={pending}
                          safetyBlocked={
                            !!character.generationError &&
                            (/blocked by safety|safety filter|safety system|safety_violations|content moderation|content blocked/i.test(
                              character.generationError,
                            ))
                          }
                          onRetry={() =>
                            runAction(() => retryIngredientAction(character.id, seriesId))
                          }
                          fetchDeletePreview={() =>
                            getIngredientDeletePreviewAction(character.id, seriesId)
                          }
                          onDelete={() =>
                            deleteIngredientWithCleanupAction(character.id, seriesId)
                          }
                          onSuccess={() => router.refresh()}
                        />
                      ) : (
                        <IngredientDeleteButton
                          ingredientId={character.id}
                          seriesId={seriesId}
                        />
                      )}
                    </div>
                    {character.description ? (
                      <p className="text-sm text-muted">{character.description}</p>
                    ) : null}
                    <GenerationStatusLine
                      status={character.generationStatus}
                      error={character.generationError}
                      hasAsset={Boolean(character.assetUrl)}
                    />

                    <FalSafeRestyleControls
                      seriesId={seriesId}
                      character={character}
                      sheetCount={sheets.length}
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
                        <EmptyState
                          variant="inline"
                          icon={Shirt}
                          title="No costumes yet"
                          description="Generate a costume preview from a wardrobe description."
                        />
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {costumes.map((costume) => (
                            <div
                              key={costume.id}
                              id={`ingredient-${costume.id}`}
                              className="relative w-28 scroll-mt-24 overflow-hidden rounded border border-border"
                            >
                              <div className="absolute right-0 top-0 z-10">
                                {costume.generationStatus === "failed" ? (
                                  <FailedGenerationControls
                                    disabled={pending}
                                    onRetry={() =>
                                      runAction(() =>
                                        retryIngredientAction(costume.id, seriesId),
                                      )
                                    }
                                    fetchDeletePreview={() =>
                                      getIngredientDeletePreviewAction(costume.id, seriesId)
                                    }
                                    onDelete={() =>
                                      deleteIngredientWithCleanupAction(costume.id, seriesId)
                                    }
                                    onSuccess={() => router.refresh()}
                                  />
                                ) : (
                                  <IngredientDeleteButton
                                    ingredientId={costume.id}
                                    seriesId={seriesId}
                                  />
                                )}
                              </div>
                              <div className="aspect-[3/4] bg-background">
                                {costume.assetUrl ? (
                                  <LightboxImageButton
                                    src={costume.assetUrl}
                                    alt={costume.name}
                                    caption={costume.name}
                                    onOpenGallery={lightbox.openGallery}
                                    className="h-full w-full"
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
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-widest text-muted">Character sheets</p>
                        {sheets.some((sheet) => sheet.status === "failed") ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              const count = sheets.filter((sheet) => sheet.status === "failed").length;
                              if (
                                !window.confirm(
                                  `Remove ${count} failed sheet${count === 1 ? "" : "s"} for ${character.name}?`,
                                )
                              ) {
                                return;
                              }
                              runAction(() =>
                                cleanupFailedSheetsForCharacterAction(character.id, seriesId),
                              );
                            }}
                            className="studio-btn studio-btn-ghost !min-h-7 !px-2 !py-1 !text-[10px]"
                          >
                            Clean up failed
                          </button>
                        ) : null}
                      </div>
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
                        <CreditCostHint cost={estimateSheetCredits()} available={null} />
                      </form>
                      <p className="text-[10px] text-muted">
                        Hold ⌘/Ctrl to select multiple episodes. One sheet applies across all selected episodes.
                      </p>

                      {sheets.length === 0 ? (
                        <EmptyState
                          variant="inline"
                          icon={Users}
                          title="No sheets yet"
                          description="Create a turnaround sheet to lock identity across episodes."
                        />
                      ) : (
                        <div className="space-y-4">
                          {sheets.map((sheet) => (
                            <div
                              key={sheet.id}
                              id={`sheet-${sheet.id}`}
                              className="scroll-mt-24 rounded border border-border bg-background p-3"
                            >
                              <div className="flex w-full items-center justify-between text-left text-sm">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSheet(expandedSheet === sheet.id ? null : sheet.id)
                                  }
                                  className="flex flex-1 items-center justify-between"
                                >
                                  <span className="flex items-center gap-2">
                                    <span>
                                      {sheet.name}
                                      {sheet.costume_name ? ` · ${sheet.costume_name}` : ""}
                                    </span>
                                    {sheet.falSafeStyled ? (
                                      <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-muted">
                                        fal-safe
                                      </span>
                                    ) : null}
                                  </span>
                                  <GenerationBadge status={sheet.status} />
                                </button>
                                <div className="ml-2 flex items-center gap-1">
                                  {sheet.status === "failed" ? (
                                    <FailedGenerationControls
                                      size="md"
                                      disabled={pending}
                                      onRetry={() =>
                                        runAction(() =>
                                          retryCharacterSheetAction(sheet.id, seriesId),
                                        )
                                      }
                                      deleteAriaLabel="Delete character sheet"
                                      fetchDeletePreview={() =>
                                        getCharacterSheetDeletePreviewAction(sheet.id, seriesId)
                                      }
                                      onDelete={() =>
                                        deleteCharacterSheetAction(sheet.id, seriesId)
                                      }
                                      onSuccess={() => router.refresh()}
                                    />
                                  ) : (
                                    <DeleteConfirmButton
                                      ariaLabel="Delete character sheet"
                                      fetchPreview={() =>
                                        getCharacterSheetDeletePreviewAction(sheet.id, seriesId)
                                      }
                                      onDelete={() =>
                                        deleteCharacterSheetAction(sheet.id, seriesId)
                                      }
                                      onSuccess={() => router.refresh()}
                                    />
                                  )}
                                </div>
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
                                  {SHEET_GALLERY_ANGLES.map((angle) => {
                                    const gallery = buildSheetLightboxGallery(sheet.angleUrls);
                                    return (
                                      <div key={angle} className="w-20 shrink-0">
                                        <div className="aspect-[3/4] overflow-hidden rounded bg-surface">
                                          {sheet.angleUrls[angle] ? (
                                            <LightboxImageButton
                                              src={sheet.angleUrls[angle]!}
                                              alt={SHEET_ANGLE_LABELS[angle]}
                                              caption={SHEET_ANGLE_LABELS[angle]}
                                              gallery={gallery}
                                              galleryIndex={sheetGalleryIndex(sheet.angleUrls, angle)}
                                              onOpenGallery={lightbox.openGallery}
                                              className="h-full w-full"
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
                                    );
                                  })}
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
      <Lightbox state={lightbox.state} onClose={lightbox.close} />
    </section>
  );
}
