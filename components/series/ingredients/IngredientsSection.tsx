"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadIngredientAction } from "@/app/(app)/series/[id]/actions";
import { RefTag } from "@/components/ui/RefTag";
import { MediaPlayer } from "@/components/ui/MediaPlayer";
import type { IngredientKind } from "@/lib/db/types";

export type IngredientCardData = {
  id: string;
  kind: IngredientKind;
  name: string;
  description: string | null;
  ref_tag: string;
  assetUrl: string | null;
  mediaType: string | null;
};

interface IngredientCardProps {
  ingredient: IngredientCardData;
}

export function IngredientCard({ ingredient }: IngredientCardProps) {
  const isAudio = ingredient.mediaType === "audio" || ingredient.kind === "voice";

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      <div className="aspect-video bg-background">
        {isAudio ? (
          <div className="flex h-full items-center p-4">
            <MediaPlayer src={ingredient.assetUrl} />
          </div>
        ) : ingredient.assetUrl ? (
          ingredient.mediaType === "video" ? (
            <video src={ingredient.assetUrl} className="h-full w-full object-cover" controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ingredient.assetUrl} alt={ingredient.name} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No asset</div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-medium text-foreground">{ingredient.name}</h3>
          <RefTag tag={ingredient.ref_tag} />
        </div>
        {ingredient.description ? (
          <p className="line-clamp-2 text-xs text-muted">{ingredient.description}</p>
        ) : null}
      </div>
    </article>
  );
}

interface IngredientsSectionProps {
  seriesId: string;
  ingredients: IngredientCardData[];
  counts: {
    total: number;
    characters: number;
    voices: number;
    outfits: number;
    locations: number;
    reference: number;
  };
}

const SECTIONS: { label: string; kinds: IngredientKind[]; countKey: keyof IngredientsSectionProps["counts"] }[] = [
  { label: "Characters", kinds: ["character"], countKey: "characters" },
  { label: "Voices", kinds: ["voice"], countKey: "voices" },
  { label: "Outfits", kinds: ["outfit"], countKey: "outfits" },
  { label: "Locations", kinds: ["location"], countKey: "locations" },
  { label: "Reference Media", kinds: ["reference", "prop"], countKey: "reference" },
];

type RefFilter = "all" | "image" | "video" | "audio";

export function IngredientsSection({ seriesId, ingredients, counts }: IngredientsSectionProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [refFilter, setRefFilter] = useState<RefFilter>("all");
  const [dragOver, setDragOver] = useState(false);

  const uploadFiles = useCallback(
    async (files: FileList | File[], kind: IngredientKind = "reference") => {
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.set("kind", kind);
          formData.set("file", file);
          const result = await uploadIngredientAction(seriesId, formData);
          if (result.error) throw new Error(result.error);
        }
        router.refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setUploading(false);
        setDragOver(false);
      }
    },
    [router, seriesId],
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
  }

  function filterReference(items: IngredientCardData[]) {
    if (refFilter === "all") return items;
    return items.filter((item) => item.mediaType === refFilter);
  }

  return (
    <div
      className="relative space-y-10"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent-muted/40">
          <p className="font-display text-xl text-accent">Drop images anywhere</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span className="rounded-full border border-border px-3 py-1">Total {counts.total}</span>
        <span className="rounded-full border border-border px-3 py-1">Characters {counts.characters}</span>
        <span className="rounded-full border border-border px-3 py-1">Voices {counts.voices}</span>
        <span className="rounded-full border border-border px-3 py-1">Outfits {counts.outfits}</span>
        <span className="rounded-full border border-border px-3 py-1">Locations {counts.locations}</span>
        <span className="rounded-full border border-border px-3 py-1">Reference {counts.reference}</span>
      </div>

      {uploading ? <p className="text-sm text-muted">Uploading…</p> : null}

      {SECTIONS.map((section) => {
        const sectionItems = ingredients.filter((i) => section.kinds.includes(i.kind));
        const displayItems =
          section.label === "Reference Media"
            ? filterReference(sectionItems)
            : sectionItems;
        const uploadKind = section.kinds[0];

        return (
          <section key={section.label}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <h2 className="font-display text-xl text-foreground">
                {section.label}{" "}
                <span className="text-muted">({counts[section.countKey]})</span>
              </h2>
              {section.label === "Reference Media" ? (
                <div className="inline-flex rounded-md border border-border p-1">
                  {(["all", "image", "video", "audio"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setRefFilter(tab)}
                      className={`rounded px-2 py-1 text-xs capitalize ${
                        refFilter === tab
                          ? "bg-accent-muted text-accent"
                          : "text-muted hover:text-accent"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="cursor-pointer text-xs text-accent hover:underline">
                  + Upload
                  <input
                    type="file"
                    className="hidden"
                    accept={
                      uploadKind === "voice"
                        ? "audio/*"
                        : uploadKind === "reference"
                          ? "image/*,video/*,audio/*"
                          : "image/*"
                    }
                    onChange={(e) => {
                      if (e.target.files?.length) void uploadFiles(e.target.files, uploadKind);
                    }}
                  />
                </label>
              )}
            </div>
            {displayItems.length === 0 ? (
              <p className="text-sm text-muted">No items yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {displayItems.map((item) => (
                  <IngredientCard key={item.id} ingredient={item} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
