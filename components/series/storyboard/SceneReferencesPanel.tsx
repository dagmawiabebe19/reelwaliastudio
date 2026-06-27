"use client";

import { RefTag } from "@/components/ui/RefTag";
import type { ResolvedReference } from "@/lib/production/types";

interface SceneReferencesPanelProps {
  resolvedReferences: ResolvedReference[];
  boundSheetIds: string[];
}

export function SceneReferencesPanel({
  resolvedReferences,
  boundSheetIds,
}: SceneReferencesPanelProps) {
  if (!resolvedReferences.length && !boundSheetIds.length) {
    return (
      <p className="text-xs text-muted">
        No references resolved yet. Mention characters/locations in the prompt or bind a sheet with @.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <p className="text-xs uppercase tracking-widest text-muted">Resolved references</p>
      <ul className="space-y-2">
        {resolvedReferences.map((ref) => (
          <li key={`${ref.type}-${ref.id}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase text-muted">
              {ref.type.replace("_", " ")}
            </span>
            <span className="text-foreground">{ref.label}</span>
            {ref.ref_tag ? <RefTag tag={ref.ref_tag} /> : null}
            {ref.assetUrls.length > 0 ? (
              <span className="text-xs text-muted">{ref.assetUrls.length} ref image(s)</span>
            ) : null}
          </li>
        ))}
      </ul>
      {boundSheetIds.length > 0 ? (
        <p className="text-[10px] text-muted">{boundSheetIds.length} sheet(s) bound for generation.</p>
      ) : null}
    </div>
  );
}
