"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { retryIngredientAction } from "@/app/(app)/series/[id]/production-actions";
import {
  deleteIngredientWithCleanupAction,
  getIngredientDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { FailedGenerationControls } from "@/components/series/ingredients/FailedGenerationControls";

export function useFailedIngredientActions(seriesId: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runAction(action: () => Promise<Record<string, unknown>>) {
    startTransition(async () => {
      const result = await action();
      if (typeof result.error === "string") {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  function renderFailedControls(
    ingredientId: string,
    options?: { size?: "sm" | "md"; deleteAriaLabel?: string },
  ) {
    return (
      <FailedGenerationControls
        size={options?.size ?? "sm"}
        disabled={pending}
        deleteAriaLabel={options?.deleteAriaLabel ?? "Delete failed ingredient"}
        onRetry={() => runAction(() => retryIngredientAction(ingredientId, seriesId))}
        fetchDeletePreview={() => getIngredientDeletePreviewAction(ingredientId, seriesId)}
        onDelete={() => deleteIngredientWithCleanupAction(ingredientId, seriesId)}
        onSuccess={() => router.refresh()}
      />
    );
  }

  return { pending, runAction, renderFailedControls };
}
