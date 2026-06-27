"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { RefTag } from "@/components/ui/RefTag";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { MediaPlayer } from "@/components/ui/MediaPlayer";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { IngredientKind } from "@/lib/db/types";
import {
  uploadIngredientFromClient,
  type UploadProgress,
} from "@/lib/storage/client-upload";
import type { IngredientCardData } from "@/lib/production/types";
import {
  CharactersSection,
} from "@/components/series/ingredients/CharactersSection";
import type { CharacterSheetCardData, EpisodeOption } from "@/lib/production/types";
import {
  LocationsSection,
  VoicesSection,
} from "@/components/series/ingredients/ProductionSections";

export type { IngredientCardData } from "@/lib/production/types";

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
        <GenerationStatusLine
          status={ingredient.generationStatus}
          error={ingredient.generationError}
        />
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
  costumesByCharacter: Record<string, IngredientCardData[]>;
  sheetsByCharacter: Record<string, CharacterSheetCardData[]>;
  episodes: EpisodeOption[];
}

const SECTIONS: { label: string; kinds: IngredientKind[]; countKey: keyof IngredientsSectionProps["counts"] }[] = [
  { label: "Reference Media", kinds: ["reference", "prop"], countKey: "reference" },
];

type RefFilter = "all" | "image" | "video" | "audio";

function acceptForKind(kind: IngredientKind): string {
  if (kind === "voice") return "audio/*";
  if (kind === "reference" || kind === "prop") return "image/*,video/*,audio/*";
  return "image/*";
}

export function IngredientsSection({
  seriesId,
  ingredients,
  counts,
  costumesByCharacter,
  sheetsByCharacter,
  episodes,
}: IngredientsSectionProps) {
  const router = useRouter();
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refFilter, setRefFilter] = useState<RefFilter>("all");
  const [dragOver, setDragOver] = useState(false);

  const hasPending = ingredients.some((i) => i.generationStatus === "pending");
  usePollWhilePending(hasPending);

  const uploadFiles = useCallback(
    async (files: FileList | File[], kind: IngredientKind = "reference") => {
      setUploadError(null);
      try {
        for (const file of Array.from(files)) {
          await uploadIngredientFromClient(seriesId, file, kind, setUploadProgress);
        }
        setUploadProgress(null);
        router.refresh();
      } catch (error) {
        setUploadProgress(null);
        const message = error instanceof Error ? error.message : "Upload failed.";
        setUploadError(message);
      } finally {
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

      {uploadError ? (
        <p className="rounded-md border border-accent/40 bg-accent-muted/30 px-3 py-2 text-sm text-accent">
          {uploadError}
        </p>
      ) : null}

      {uploadProgress ? (
        <div className="space-y-2 rounded-md border border-border bg-surface-elevated p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-foreground">Uploading {uploadProgress.fileName}</span>
            <span className="text-muted">{uploadProgress.percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background">
            <div
              className="h-full bg-accent transition-[width] duration-150"
              style={{ width: `${uploadProgress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      <CharactersSection
        seriesId={seriesId}
        characters={ingredients.filter((i) => i.kind === "character")}
        costumesByCharacter={costumesByCharacter}
        sheetsByCharacter={sheetsByCharacter}
        episodes={episodes}
      />

      <VoicesSection
        seriesId={seriesId}
        voices={ingredients.filter((i) => i.kind === "voice")}
        characters={ingredients.filter((i) => i.kind === "character")}
      />

      <LocationsSection
        seriesId={seriesId}
        locations={ingredients.filter((i) => i.kind === "location")}
      />

      {SECTIONS.map((section) => {
        const sectionItems = ingredients.filter((i) => section.kinds.includes(i.kind));
        const displayItems = filterReference(sectionItems);
        const uploadKind = section.kinds[0];

        return (
          <section key={section.label}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <h2 className="font-display text-xl text-foreground">
                {section.label}{" "}
                <span className="text-muted">({counts[section.countKey]})</span>
              </h2>
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
              <label className="cursor-pointer text-xs text-accent hover:underline">
                + Upload
                <input
                  type="file"
                  className="hidden"
                  accept={acceptForKind(uploadKind)}
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files, uploadKind);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {displayItems.length === 0 ? (
              <p className="text-sm text-muted">No reference media yet. Drop files anywhere on this page.</p>
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
