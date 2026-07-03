"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageIcon, Upload } from "lucide-react";
import {
  clearKeyArtAction,
  setKeyArtFromIngredientAction,
} from "@/app/(app)/series/[id]/key-art-actions";
import { uploadKeyArtFromClient } from "@/lib/storage/client-upload";
import type { IngredientCardData } from "@/lib/production/types";

interface KeyArtSectionProps {
  seriesId: string;
  keyArtUrl: string | null;
  pickableIngredients: IngredientCardData[];
}

export function KeyArtSection({
  seriesId,
  keyArtUrl,
  pickableIngredients,
}: KeyArtSectionProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  function handleUpload(file: File) {
    setError(null);
    startTransition(async () => {
      try {
        await uploadKeyArtFromClient(seriesId, file);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-foreground">Key art</h2>
          <p className="mt-1 text-sm text-muted">
            Series poster or cover — used in lists and exports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-elevated disabled:opacity-50"
          >
            <Upload className="size-4" strokeWidth={1.75} aria-hidden />
            Upload
          </button>
          {pickableIngredients.length > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowPicker((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-elevated disabled:opacity-50"
            >
              <ImageIcon className="size-4" strokeWidth={1.75} aria-hidden />
              Pick existing
            </button>
          ) : null}
          {keyArtUrl ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Remove key art from this series?")) return;
                startTransition(async () => {
                  const result = await clearKeyArtAction(seriesId);
                  if (result.error) setError(result.error);
                  else router.refresh();
                });
              }}
              className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-accent disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />

      <div className="mt-4 aspect-video max-w-xs overflow-hidden rounded-md border border-border bg-background">
        {keyArtUrl ? (
          <Image
            src={keyArtUrl}
            alt="Series key art"
            width={400}
            height={225}
            className="size-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted">
            No key art yet
          </div>
        )}
      </div>

      {showPicker && pickableIngredients.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {pickableIngredients.map((ing) => (
            <button
              key={ing.id}
              type="button"
              disabled={pending || !ing.assetUrl}
              onClick={() => {
                startTransition(async () => {
                  const result = await setKeyArtFromIngredientAction(seriesId, ing.id);
                  if (result.error) setError(result.error);
                  else {
                    setShowPicker(false);
                    router.refresh();
                  }
                });
              }}
              className="overflow-hidden rounded-md border border-border text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <div className="aspect-video bg-background">
                {ing.assetUrl ? (
                  <Image
                    src={ing.assetUrl}
                    alt={ing.name}
                    width={160}
                    height={90}
                    className="size-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted">
                    No image
                  </div>
                )}
              </div>
              <p className="truncate px-2 py-1 text-xs">{ing.name}</p>
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-accent">{error}</p> : null}
    </section>
  );
}
