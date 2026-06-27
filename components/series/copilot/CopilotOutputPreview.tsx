"use client";

import { useCallback, useEffect } from "react";
import { pollCopilotOutputAction } from "@/app/(app)/series/[id]/copilot-output-actions";
import { RefTag } from "@/components/ui/RefTag";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { SHEET_ANGLE_LABELS } from "@/lib/production/prompts";
import type { CopilotOutputItem } from "@/lib/copilot/output";

const SHEET_ANGLES = [
  "front",
  "left_profile",
  "right_profile",
  "three_quarter",
  "back",
] as const;

interface CopilotOutputPreviewProps {
  seriesId: string;
  items: CopilotOutputItem[];
  onOpenInLibrary: (item: CopilotOutputItem) => void;
  onItemsUpdate: (updater: (prev: CopilotOutputItem[]) => CopilotOutputItem[]) => void;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "character":
      return "Character";
    case "outfit":
      return "Costume";
    case "location":
      return "Location";
    case "voice":
      return "Voice";
    default:
      return kind;
  }
}

function IngredientOutputCard({
  item,
  onOpen,
}: {
  item: Extract<CopilotOutputItem, { type: "ingredient" }>;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface-elevated p-3 text-left transition-colors hover:border-accent/50"
    >
      <div className="flex gap-3">
        <div className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-md bg-background">
          {item.assetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.assetUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-muted">
              {item.status === "pending" ? "Generating…" : "No preview"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
              {kindLabel(item.ingredientKind)}
            </span>
            {item.refTag ? <RefTag tag={item.refTag} /> : null}
          </div>
          <p className="truncate font-medium text-foreground">{item.name}</p>
          <GenerationStatusLine
            status={item.status}
            error={item.generationError}
            showReady={item.status === "ready"}
          />
          <p className="text-[10px] text-muted">Click to open in Ingredients</p>
        </div>
      </div>
    </button>
  );
}

function SheetOutputCard({
  item,
  onOpen,
}: {
  item: Extract<CopilotOutputItem, { type: "sheet" }>;
  onOpen: () => void;
}) {
  const filled = SHEET_ANGLES.filter((a) => item.angleUrls[a]).length;
  const progressLabel =
    item.status === "pending"
      ? `Angle ${Math.max(filled, item.angleProgress)}/${item.angleTotal}`
      : `${filled}/${SHEET_ANGLES.length} angles`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-surface-elevated p-3 text-left transition-colors hover:border-accent/50"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
            Character sheet
          </span>
          <span className="text-[10px] text-amber-400">{progressLabel}</span>
        </div>
        <p className="font-medium text-foreground">{item.name}</p>
        <p className="text-xs text-muted">
          {item.characterName}
          {item.costumeName ? ` · ${item.costumeName}` : ""}
        </p>
        <div className="flex gap-1 overflow-x-auto">
          {SHEET_ANGLES.map((angle) => (
            <div key={angle} className="w-14 shrink-0">
              <div className="aspect-[3/4] overflow-hidden rounded bg-background">
                {item.angleUrls[angle] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.angleUrls[angle]!}
                    alt={SHEET_ANGLE_LABELS[angle]}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[8px] text-muted">
                    {item.status === "pending" ? "…" : "—"}
                  </div>
                )}
              </div>
              <p className="mt-0.5 text-center text-[8px] text-muted">
                {SHEET_ANGLE_LABELS[angle]}
              </p>
            </div>
          ))}
        </div>
        <GenerationStatusLine
          status={item.status}
          error={item.generationError}
          showReady={item.status === "ready"}
        />
        <p className="text-[10px] text-muted">Click to open in Ingredients</p>
      </div>
    </button>
  );
}

export function CopilotOutputPreview({
  seriesId,
  items,
  onOpenInLibrary,
  onItemsUpdate,
}: CopilotOutputPreviewProps) {
  const hasPending = items.some(
    (item) => item.status === "pending" || item.status === "draft",
  );

  const refresh = useCallback(async () => {
    if (!items.length) return;

    const ingredientIds = items
      .filter((i): i is Extract<CopilotOutputItem, { type: "ingredient" }> => i.type === "ingredient")
      .map((i) => i.id);
    const sheetIds = items
      .filter((i): i is Extract<CopilotOutputItem, { type: "sheet" }> => i.type === "sheet")
      .map((i) => i.id);

    const result = await pollCopilotOutputAction({ seriesId, ingredientIds, sheetIds });
    if ("error" in result && result.error) return;

    onItemsUpdate((prev) =>
      prev.map((item) => {
        if (item.type === "ingredient") {
          const fresh = result.ingredients?.find((i) => i?.id === item.id);
          if (!fresh) return item;
          return {
            ...item,
            name: fresh.name,
            refTag: fresh.refTag,
            status: fresh.status,
            generationError: fresh.generationError,
            assetUrl: fresh.assetUrl,
          };
        }
        const fresh = result.sheets?.find((s) => s?.id === item.id);
        if (!fresh) return item;
        return {
          ...item,
          name: fresh.name,
          characterName: fresh.characterName,
          costumeName: fresh.costumeName,
          status: fresh.status,
          generationError: fresh.generationError,
          angleUrls: fresh.angleUrls,
          angleProgress: fresh.angleCount,
        };
      }),
    );
  }, [items, onItemsUpdate, seriesId]);

  useEffect(() => {
    if (!hasPending) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 2500);
    return () => clearInterval(interval);
  }, [hasPending, refresh]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Co-pilot output
      </p>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="font-display text-lg text-foreground">Generated assets appear here</p>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Ask the co-pilot to create characters, costumes, locations, voices, or character sheets.
            Previews update live as generation completes.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {items.map((item) =>
            item.type === "ingredient" ? (
              <IngredientOutputCard
                key={`ingredient-${item.id}`}
                item={item}
                onOpen={() => onOpenInLibrary(item)}
              />
            ) : (
              <SheetOutputCard
                key={`sheet-${item.id}`}
                item={item}
                onOpen={() => onOpenInLibrary(item)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
