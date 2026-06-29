"use client";

import type { ResolvedReference } from "@/lib/production/types";

interface SceneReferencesPanelProps {
  resolvedReferences: ResolvedReference[];
  boundSheetIds: string[];
}

function RefThumb({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-8 w-8 shrink-0" />
  );
}

export function SceneReferencesPanel({
  resolvedReferences,
  boundSheetIds,
}: SceneReferencesPanelProps) {
  if (!resolvedReferences.length && !boundSheetIds.length) {
    return (
      <p className="text-xs text-muted">
        No identity locks yet — mention @sheets or ingredients in the prompt.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="studio-section-label">Media & locks</p>
      <div className="flex flex-wrap gap-2">
        {resolvedReferences.map((ref) => {
          const thumbUrl = ref.assetUrls[0] ?? null;
          return (
            <div key={`${ref.type}-${ref.id}`} className="studio-ref-chip">
              {thumbUrl ? (
                <RefThumb url={thumbUrl} />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-background text-[9px] uppercase text-muted">
                  {ref.type.slice(0, 4)}
                </span>
              )}
              <span className="max-w-[8rem] truncate">
                <span className="block text-[10px] uppercase tracking-wide text-muted">
                  {ref.type.replace("_", " ")}
                </span>
                <span className="block truncate text-xs text-foreground">{ref.label}</span>
              </span>
            </div>
          );
        })}
      </div>
      {boundSheetIds.length > 0 ? (
        <p className="text-[10px] text-muted">
          {boundSheetIds.length} character sheet{boundSheetIds.length === 1 ? "" : "s"} bound for
          generation.
        </p>
      ) : null}
    </div>
  );
}
