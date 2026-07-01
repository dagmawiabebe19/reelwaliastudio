import "server-only";

import { isIngredientReadyForBinding } from "@/lib/production/reference-readiness";

type IngredientLike = {
  id: string;
  generation_status?: string | null;
  primary_asset_id?: string | null;
  created_at?: string;
  assets?: { bucket: string; storage_path: string } | null;
};

/** Prefer newest ready ingredient; never return failed/pending/missing (mirrors pickBestReadySheet). */
export function pickBestReadyIngredient<T extends IngredientLike>(
  candidates: T[],
): T | null {
  const ready = candidates.filter((item) => isIngredientReadyForBinding(item));
  if (!ready.length) return null;

  return [...ready].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  )[0];
}
