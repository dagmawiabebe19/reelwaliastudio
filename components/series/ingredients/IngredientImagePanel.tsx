"use client";

import { ImageOff } from "lucide-react";
import { retryIngredientAction } from "@/app/(app)/series/[id]/production-actions";
import { GeneratingPulse, SkeletonThumbnail } from "@/components/ui/Skeleton";
import { LightboxImageButton } from "@/components/ui/Lightbox";
import type { useLightbox } from "@/components/ui/Lightbox";
import type { IngredientCardData } from "@/lib/production/types";
import { useFailedIngredientActions } from "@/components/series/ingredients/useFailedIngredientActions";

type IngredientImagePanelProps = {
  ingredient: Pick<
    IngredientCardData,
    "id" | "name" | "assetUrl" | "generationStatus" | "mediaType" | "kind"
  >;
  seriesId: string;
  aspectClassName?: string;
  onOpenGallery?: ReturnType<typeof useLightbox>["openGallery"];
};

export function ingredientImageMissing(ingredient: {
  assetUrl: string | null;
  generationStatus?: string | null;
  kind?: string;
}): boolean {
  if (ingredient.kind === "voice") return false;
  if (ingredient.assetUrl) return false;
  if (ingredient.generationStatus === "pending") return false;
  if (ingredient.generationStatus === "failed") return false;
  return true;
}

export function IngredientImagePanel({
  ingredient,
  seriesId,
  aspectClassName = "aspect-video",
  onOpenGallery,
}: IngredientImagePanelProps) {
  const { runAction } = useFailedIngredientActions(seriesId);
  const isPending = ingredient.generationStatus === "pending";
  const isMissing = ingredientImageMissing(ingredient);

  if (ingredient.assetUrl) {
    if (ingredient.mediaType === "video") {
      return (
        <div className={aspectClassName}>
          <video src={ingredient.assetUrl} className="h-full w-full object-cover" controls />
        </div>
      );
    }

    if (onOpenGallery) {
      return (
        <div className={aspectClassName}>
          <LightboxImageButton
            src={ingredient.assetUrl}
            alt={ingredient.name}
            caption={ingredient.name}
            onOpenGallery={onOpenGallery}
            className="h-full w-full"
          />
        </div>
      );
    }

    return (
      <div className={aspectClassName}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ingredient.assetUrl} alt={ingredient.name} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className={`relative overflow-hidden bg-background ${aspectClassName}`}>
        <SkeletonThumbnail className="absolute inset-0" />
        <div className="relative flex h-full items-center justify-center">
          <GeneratingPulse label="Generating…" />
        </div>
      </div>
    );
  }

  if (isMissing) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-background p-4 text-center ${aspectClassName}`}
      >
        <ImageOff className="h-6 w-6 text-muted" aria-hidden />
        <p className="text-xs text-amber-400">Image missing — regenerate</p>
        <button
          type="button"
          className="studio-btn studio-btn-ghost !min-h-7 !px-2 !py-1 !text-[10px]"
          onClick={() => runAction(() => retryIngredientAction(ingredient.id, seriesId))}
        >
          Regenerate
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center bg-background ${aspectClassName}`}>
      <SkeletonThumbnail className="h-full w-full opacity-30" />
    </div>
  );
}
