"use server";

import { revalidatePath } from "next/cache";
import { runVoiceGeneration } from "@/lib/ai/voice";
import { createIngredient, verifySeriesOwnership } from "@/lib/db/ingredients";

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

    const { updateIngredient } = await import("@/lib/db/ingredients");
    if (result.error) {
      await updateIngredient(ingredient.id, {
        generation_status: "failed",
        generation_error: result.error,
      });
      revalidatePath(`/series/${seriesId}`);
      return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag, stub: true, error: result.error };
    }

    revalidatePath(`/series/${seriesId}`);
    return { ingredientId: ingredient.id, ref_tag: ingredient.ref_tag };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create voice." };
  }
}
