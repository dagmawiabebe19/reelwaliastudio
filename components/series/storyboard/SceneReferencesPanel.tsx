"use client";

import { useState } from "react";
import { Lightbox, LightboxImageButton, useLightbox } from "@/components/ui/Lightbox";
import type { ResolvedReference } from "@/lib/production/types";

interface SceneReferencesPanelProps {
  resolvedReferences: ResolvedReference[];
  boundSheetIds: string[];
}

function RefThumb({
  url,
  label,
  onOpenGallery,
}: {
  url: string;
  label: string;
  onOpenGallery: ReturnType<typeof useLightbox>["openGallery"];
}) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-background text-[8px] uppercase text-muted"
        title={label}
      >
        —
      </span>
    );
  }

  return (
    <LightboxImageButton
      src={url}
      alt={label}
      caption={label}
      onOpenGallery={onOpenGallery}
      className="h-8 w-8 shrink-0 rounded-sm"
      imageClassName="h-8 w-8 rounded-sm object-cover"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-8 w-8 rounded-sm object-cover"
        onError={() => setBroken(true)}
        draggable={false}
      />
    </LightboxImageButton>
  );
}

function RefPlaceholder({ type, label }: { type: string; label: string }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-dashed border-border bg-background text-[8px] uppercase text-muted"
      title={label}
    >
      {type === "voice" ? "VO" : type.slice(0, 3)}
    </span>
  );
}

export function SceneReferencesPanel({
  resolvedReferences,
  boundSheetIds,
}: SceneReferencesPanelProps) {
  const lightbox = useLightbox();

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
                <RefThumb url={thumbUrl} label={ref.label} onOpenGallery={lightbox.openGallery} />
              ) : (
                <RefPlaceholder type={ref.type} label={ref.label} />
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
      <Lightbox state={lightbox.state} onClose={lightbox.close} />
    </div>
  );
}
