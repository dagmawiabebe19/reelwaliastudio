"use server";

import { revalidatePath } from "next/cache";
import { runVoiceGeneration } from "@/lib/ai/voice";
import { retryVoiceGeneration } from "@/lib/ai/generation/voice-retry";
import { getDbClient } from "@/lib/db/client";
import { createIngredient, getIngredient, updateIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";
import { bindIngredientToScene } from "@/lib/db/scene-ingredients";

export async function generateVoiceAction(seriesId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const characterId = String(formData.get("characterId") ?? "").trim() || null;
  if (!name || !description) return { error: "Name and voice description are required." };

  try {
    await verifySeriesOwnership(seriesId);
    const ingredient = await createIngredient({
      seriesId,
      kind: "voice",
      name,
      description,
      characterId,
      mediaType: "audio",
      generationStatus: "pending",
    });

    const result = await runVoiceGeneration({
      text: description,
      voiceId: ingredient.id,
      description,
      characterId,
    });

    if (result.error) {
      // Description-only voice until audio provider is wired.
      await updateIngredient(ingredient.id, {
        generation_status: "ready",
        generation_error: null,
      });
      revalidatePath(`/series/${seriesId}`);
      return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag };
    }

    await updateIngredient(ingredient.id, {
      generation_status: "ready",
      generation_error: null,
    });

    revalidatePath(`/series/${seriesId}`);
    return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create voice." };
  }
}

export async function retryVoiceAction(ingredientId: string, seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const result = await retryVoiceGeneration(ingredientId, `/series/${seriesId}`);
    if (result.status === "failed") {
      return { error: result.error ?? "Voice setup failed." };
    }
    return { ingredientId, status: result.status };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to retry voice." };
  }
}

export async function mergeVoicesAction(
  seriesId: string,
  keepId: string,
  mergeIds: string[],
) {
  if (mergeIds.length === 0) {
    return { error: "No voices selected to merge." };
  }

  try {
    await verifySeriesOwnership(seriesId);
    const keep = await getIngredient(keepId);
    if (!keep || keep.series_id !== seriesId || keep.kind !== "voice") {
      return { error: "Keep voice not found." };
    }

    const supabase = await getDbClient();

    for (const mergeId of mergeIds) {
      if (mergeId === keepId) continue;
      const loser = await getIngredient(mergeId);
      if (!loser || loser.series_id !== seriesId || loser.kind !== "voice") {
        return { error: `Voice ${mergeId} not found.` };
      }

      const { data: bindings, error: bindError } = await supabase
        .from("scene_ingredients")
        .select("scene_id, role")
        .eq("ingredient_id", mergeId);

      if (bindError) throw new Error(bindError.message);

      for (const binding of bindings ?? []) {
        const { data: existing } = await supabase
          .from("scene_ingredients")
          .select("ingredient_id")
          .eq("scene_id", binding.scene_id)
          .eq("ingredient_id", keepId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("scene_ingredients")
            .delete()
            .eq("scene_id", binding.scene_id)
            .eq("ingredient_id", mergeId);
        } else {
          await bindIngredientToScene(binding.scene_id, keepId, binding.role);
          await supabase
            .from("scene_ingredients")
            .delete()
            .eq("scene_id", binding.scene_id)
            .eq("ingredient_id", mergeId);
        }
      }

      const { error: deleteError } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", mergeId);
      if (deleteError) throw new Error(deleteError.message);
    }

    revalidatePath(`/series/${seriesId}`);
    return { success: true as const, keepId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Merge failed." };
  }
}
