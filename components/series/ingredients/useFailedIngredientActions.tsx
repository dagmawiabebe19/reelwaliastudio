"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { retryIngredientAction } from "@/app/(app)/series/[id]/production-actions";
import {
  deleteIngredientWithCleanupAction,
  getIngredientDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { FailedGenerationControls } from "@/components/series/ingredients/FailedGenerationControls";

function isSafetyBlockedError(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  return (
    /blocked by safety/i.test(error) ||
    /safety filter/i.test(error) ||
    /safety system/i.test(error) ||
    /safety_violations/i.test(error) ||
    /content moderation/i.test(error) ||
    /content blocked/i.test(error)
  );
}

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
    options?: {
      size?: "sm" | "md";
      deleteAriaLabel?: string;
      generationError?: string | null;
    },
  ) {
    return (
      <FailedGenerationControls
        size={options?.size ?? "sm"}
        disabled={pending}
        safetyBlocked={isSafetyBlockedError(options?.generationError)}
        deleteAriaLabel={options?.deleteAriaLabel ?? "Delete failed ingredient"}
        onRetry={() => runAction(() => retryIngredientAction(ingredientId, seriesId))}
        fetchDeletePreview={() => getIngredientDeletePreviewAction(ingredientId, seriesId)}
        onDelete={() => deleteIngredientWithCleanupAction(ingredientId, seriesId)}
        onSuccess={() => router.refresh()}
      />
    );
  }

  return { pending, runAction, renderFailedControls, isSafetyBlockedError };
}
