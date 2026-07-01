import "server-only";

import { runVoiceGeneration } from "@/lib/ai/voice";
import { getIngredient, updateIngredient } from "@/lib/db/ingredients";

export async function retryVoiceGeneration(
  ingredientId: string,
  revalidatePath?: string,
): Promise<{ status: "ready" | "failed"; error?: string; stub?: boolean }> {
  const ingredient = await getIngredient(ingredientId);
  if (!ingredient || ingredient.kind !== "voice") {
    return { status: "failed", error: "Voice ingredient not found." };
  }
  if (ingredient.generation_status === "pending") {
    return { status: "failed", error: "Voice is already generating." };
  }

  const description = ingredient.description?.trim();
  if (!description) {
    return { status: "failed", error: "Missing voice description — cannot retry." };
  }

  await updateIngredient(ingredientId, {
    generation_status: "pending",
    generation_error: null,
  });

  const result = await runVoiceGeneration({
    text: description,
    voiceId: ingredientId,
    description,
    characterId: ingredient.character_id,
  });

  if (result.error) {
    await updateIngredient(ingredientId, {
      generation_status: "failed",
      generation_error: result.error,
    });
    if (revalidatePath) {
      const { revalidatePath: revalidate } = await import("next/cache");
      revalidate(revalidatePath);
    }
    return { status: "failed", error: result.error, stub: true };
  }

  await updateIngredient(ingredientId, {
    generation_status: "ready",
    generation_error: null,
  });

  if (revalidatePath) {
    const { revalidatePath: revalidate } = await import("next/cache");
    revalidate(revalidatePath);
  }

  return { status: "ready" };
}
