"use client";

import type { ReactNode } from "react";
import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageOff, X } from "lucide-react";
import {
  deleteCharacterSheetAction,
  getCharacterSheetDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { retryCharacterSheetAction } from "@/app/(app)/series/[id]/production-actions";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";
import { Lightbox, LightboxImageButton, useLightbox } from "@/components/ui/Lightbox";
import { ICON_SM, ICON_STROKE } from "@/components/ui/icon";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type {
  CharacterSheetCardData,
  IngredientCardData,
  MentionSheet,
} from "@/lib/production/types";
import type { MentionIngredient } from "@/components/series/storyboard/ScenePromptEditor";

function ItemStatusBadge({ status }: { status?: string | null }) {
  if (status === "pending") {
    return <span className="shrink-0 text-[10px] text-amber-400">Generating…</span>;
  }
  if (status === "failed") {
    return <span className="shrink-0 text-[10px] text-accent">Failed</span>;
  }
  return <span className="shrink-0 text-[10px] text-emerald-400/90">Ready</span>;
}

function PanelRow({
  name,
  refLabel,
  status,
  thumbnailUrl,
  thumbnailAlt,
  referenced,
  disabled,
  onInsert,
  trailingActions,
}: {
  name: string;
  refLabel: string;
  status?: string | null;
  thumbnailUrl?: string | null;
  thumbnailAlt?: string;
  referenced: boolean;
  disabled?: boolean;
  onInsert: () => void;
  trailingActions?: ReactNode;
}) {
  const lightbox = useLightbox();

  return (
    <div className="studio-ref-row flex items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-border/80 bg-background">
        {thumbnailUrl ? (
          <LightboxImageButton
            src={thumbnailUrl}
            alt={thumbnailAlt ?? name}
            caption={name}
            onOpenGallery={lightbox.openGallery}
            className="h-full w-full"
            imageClassName="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <ImageOff className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onInsert}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <p className="truncate text-xs font-medium text-foreground">{name}</p>
        <p className="truncate font-mono text-[10px] text-muted">{refLabel}</p>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ItemStatusBadge status={status} />
        {referenced ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-status-validated" title="Referenced in shot prompt">
            <Check className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
            in prompt
          </span>
        ) : null}
        {trailingActions}
      </div>
      <Lightbox state={lightbox.state} onClose={lightbox.close} />
    </div>
  );
}

interface StudioIngredientsPanelProps {
  seriesId: string;
  ingredients: IngredientCardData[];
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  mentionSheets: MentionSheet[];
  prompt: string;
  boundIngredientIds: string[];
  boundSheetIds: string[];
  hasActiveScene: boolean;
  onInsertIngredient: (ingredient: MentionIngredient) => void;
  onInsertSheet: (sheet: MentionSheet) => void;
  onClose: () => void;
}

export function StudioIngredientsPanel({
  seriesId,
  ingredients,
  costumesByCharacter,
  sheetsByCharacter,
  mentionSheets,
  prompt,
  boundIngredientIds,
  boundSheetIds,
  hasActiveScene,
  onInsertIngredient,
  onInsertSheet,
  onClose,
}: StudioIngredientsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const characters = ingredients.filter((item) => item.kind === "character");
  const locations = ingredients.filter((item) => item.kind === "location");
  const voices = ingredients.filter((item) => item.kind === "voice");
  const costumes = Object.values(costumesByCharacter).flat();
  const sheets = Object.values(sheetsByCharacter).flat();

  const sheetMentionById = useMemo(
    () => new Map(mentionSheets.map((sheet) => [sheet.id, sheet])),
    [mentionSheets],
  );

  const hasPending =
    ingredients.some((item) => item.generationStatus === "pending") ||
    costumes.some((item) => item.generationStatus === "pending") ||
    sheets.some((item) => item.status === "pending");

  usePollWhilePending(hasPending);

  function isIngredientReferenced(ingredient: IngredientCardData): boolean {
    if (boundIngredientIds.includes(ingredient.id)) return true;
    return prompt.includes(ingredient.ref_tag);
  }

  function isSheetReferenced(sheet: CharacterSheetCardData): boolean {
    if (boundSheetIds.includes(sheet.id)) return true;
    const mention = sheetMentionById.get(sheet.id);
    if (mention && prompt.includes(`@sheet:${mention.label}`)) return true;
    return prompt.toLowerCase().includes(sheet.name.toLowerCase());
  }

  function runSheetAction(action: () => Promise<Record<string, unknown>>) {
    startTransition(async () => {
      const result = await action();
      if (typeof result.error === "string") {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function renderSection(title: string, children: ReactNode) {
    return (
      <section className="space-y-2">
        <h3 className="studio-section-label">{title}</h3>
        {children}
      </section>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border/80 bg-surface-elevated/30">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
        <div>
          <p className="studio-section-label">References</p>
          <p className="mt-0.5 text-[10px] text-muted">Click to insert @mention into shot description</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring studio-icon-btn"
          aria-label="Close references panel"
        >
          <X className={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
        {!hasActiveScene ? (
          <p className="text-xs text-muted">Select a segment to insert references into its shot description.</p>
        ) : null}

        {renderSection(
          `Characters (${characters.length})`,
          characters.length === 0 ? (
            <p className="text-xs text-muted">No characters yet.</p>
          ) : (
            <div className="space-y-2">
              {characters.map((character) => (
                <PanelRow
                  key={character.id}
                  name={character.name}
                  refLabel={character.ref_tag}
                  status={character.generationStatus}
                  thumbnailUrl={character.assetUrl}
                  referenced={isIngredientReferenced(character)}
                  disabled={!hasActiveScene}
                  onInsert={() =>
                    onInsertIngredient({
                      id: character.id,
                      ref_tag: character.ref_tag,
                      name: character.name,
                    })
                  }
                />
              ))}
            </div>
          ),
        )}

        {renderSection(
          `Character sheets (${sheets.length})`,
          sheets.length === 0 ? (
            <p className="text-xs text-muted">No sheets yet.</p>
          ) : (
            <div className="space-y-2">
              {sheets.map((sheet) => {
                const mention = sheetMentionById.get(sheet.id);
                const thumb = sheet.angleUrls.front ?? sheet.angleUrls.three_quarter ?? null;
                const label = mention
                  ? `@sheet:${mention.label}`
                  : `@sheet:${sheet.name}`;
                return (
                  <PanelRow
                    key={sheet.id}
                    name={
                      mention
                        ? `${mention.character_name}${mention.costume_name ? ` · ${mention.costume_name}` : ""} — ${mention.label}`
                        : sheet.name
                    }
                    refLabel={label}
                    status={sheet.status}
                    thumbnailUrl={thumb}
                    referenced={isSheetReferenced(sheet)}
                    disabled={!hasActiveScene || !mention || sheet.status !== "ready"}
                    onInsert={() => mention && onInsertSheet(mention)}
                    trailingActions={
                      sheet.status === "failed" ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              runSheetAction(() =>
                                retryCharacterSheetAction(sheet.id, seriesId),
                              )
                            }
                            className="studio-btn studio-btn-secondary !min-h-6 !px-1.5 !py-0.5 !text-[9px]"
                          >
                            Retry
                          </button>
                          <DeleteConfirmButton
                            ariaLabel="Delete failed sheet"
                            className="!min-h-6 !min-w-6"
                            fetchPreview={() =>
                              getCharacterSheetDeletePreviewAction(sheet.id, seriesId)
                            }
                            onDelete={() => deleteCharacterSheetAction(sheet.id, seriesId)}
                            onSuccess={() => router.refresh()}
                          />
                        </div>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          ),
        )}

        {renderSection(
          `Locations (${locations.length})`,
          locations.length === 0 ? (
            <p className="text-xs text-muted">No locations yet.</p>
          ) : (
            <div className="space-y-2">
              {locations.map((location) => (
                <PanelRow
                  key={location.id}
                  name={location.name}
                  refLabel={location.ref_tag}
                  status={location.generationStatus}
                  thumbnailUrl={location.assetUrl}
                  referenced={isIngredientReferenced(location)}
                  disabled={!hasActiveScene}
                  onInsert={() =>
                    onInsertIngredient({
                      id: location.id,
                      ref_tag: location.ref_tag,
                      name: location.name,
                    })
                  }
                />
              ))}
            </div>
          ),
        )}

        {renderSection(
          `Costumes (${costumes.length})`,
          costumes.length === 0 ? (
            <p className="text-xs text-muted">No costumes yet.</p>
          ) : (
            <div className="space-y-2">
              {costumes.map((costume) => (
                <PanelRow
                  key={costume.id}
                  name={costume.name}
                  refLabel={costume.ref_tag}
                  status={costume.generationStatus}
                  thumbnailUrl={costume.assetUrl}
                  referenced={isIngredientReferenced(costume)}
                  disabled={!hasActiveScene}
                  onInsert={() =>
                    onInsertIngredient({
                      id: costume.id,
                      ref_tag: costume.ref_tag,
                      name: costume.name,
                    })
                  }
                />
              ))}
            </div>
          ),
        )}

        {renderSection(
          `Voices (${voices.length})`,
          voices.length === 0 ? (
            <p className="text-xs text-muted">No voices yet.</p>
          ) : (
            <div className="space-y-2">
              {voices.map((voice) => (
                <PanelRow
                  key={voice.id}
                  name={voice.name}
                  refLabel={voice.ref_tag}
                  status={voice.generationStatus}
                  referenced={isIngredientReferenced(voice)}
                  disabled={!hasActiveScene}
                  onInsert={() =>
                    onInsertIngredient({
                      id: voice.id,
                      ref_tag: voice.ref_tag,
                      name: voice.name,
                    })
                  }
                />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
