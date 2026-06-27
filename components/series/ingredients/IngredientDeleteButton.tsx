"use client";

import { useRouter } from "next/navigation";
import {
  deleteIngredientWithCleanupAction,
  getIngredientDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { DeleteConfirmButton } from "@/components/ui/DeleteConfirmButton";

interface IngredientDeleteButtonProps {
  ingredientId: string;
  seriesId: string;
  className?: string;
}

export function IngredientDeleteButton({
  ingredientId,
  seriesId,
  className,
}: IngredientDeleteButtonProps) {
  const router = useRouter();

  return (
    <DeleteConfirmButton
      ariaLabel="Delete ingredient"
      className={className}
      fetchPreview={() => getIngredientDeletePreviewAction(ingredientId, seriesId)}
      onDelete={() => deleteIngredientWithCleanupAction(ingredientId, seriesId)}
      onSuccess={() => router.refresh()}
    />
  );
}
