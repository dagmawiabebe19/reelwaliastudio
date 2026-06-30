import "server-only";

import { after } from "next/server";
import { getActiveUserId } from "@/lib/auth/getUser";
import { CopilotAbortError, throwIfAborted } from "@/lib/ai/copilot/abort";
import { isInsufficientCreditsError } from "@/lib/credits/errors";
import { estimateSheetCredits } from "@/lib/credits/pricing";
import { withCredits, withCreditsAbortable } from "@/lib/credits/meter";
import { runOpenAiImage } from "@/lib/ai/image/openai-image";
import { runWithConcurrency } from "@/lib/ai/generation/concurrency";
import {
  defaultAspectRatioForIngredients,
  sheetAnglePrompt,
  SHEET_ANGLE_LABELS,
  type SheetAngle,
} from "@/lib/production/prompts";
import { createAsset } from "@/lib/db/assets";
import {
  addSheetAngle,
  getCharacterSheet,
  updateCharacterSheetStatus,
} from "@/lib/db/character-sheets";
import { getIngredientRefUrl } from "@/lib/ai/generation/ingredient-generation";
import type { GenerationProgressCallback } from "@/lib/generation/progress";

const SHEET_ANGLES: SheetAngle[] = [
  "front",
  "left_profile",
  "right_profile",
  "three_quarter",
  "back",
];

async function runSheetGenerationCore(
  sheetId: string,
  onProgress?: GenerationProgressCallback,
  options?: { abortSignal?: AbortSignal; onBillableWorkStarted?: () => void },
): Promise<{ status: "ready" }> {
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet) throw new Error("Character sheet not found.");

  const characterName = sheet.character?.name ?? "Character";
  const costumeNote = sheet.costume
    ? `Wearing costume: ${sheet.costume.name}.`
    : "Base wardrobe from character reference.";

  const refUrls: string[] = [];
  const headshotUrl = await getIngredientRefUrl(sheet.character_id);
  if (headshotUrl) refUrls.push(headshotUrl);
  if (sheet.costume_id) {
    const costumeUrl = await getIngredientRefUrl(sheet.costume_id);
    if (costumeUrl) refUrls.push(costumeUrl);
  }

  if (!refUrls.length) {
    throw new Error("Character headshot is required before generating a sheet.");
  }

  const total = SHEET_ANGLES.length;
  let completed = 0;
  const failures: Array<{ angle: SheetAngle; error: string }> = [];

  await runWithConcurrency(SHEET_ANGLES, 3, async (angle) => {
    try {
      throwIfAborted(options?.abortSignal);
      const prompt = sheetAnglePrompt(angle, characterName, costumeNote);
      const result = await runOpenAiImage({
        prompt,
        refImageUrls: refUrls,
        aspectRatio: defaultAspectRatioForIngredients(),
        count: 1,
        resolution: "720p",
        safety: "sfw",
        sceneId: sheetId,
        abortSignal: options?.abortSignal,
        onBillableWorkStarted: options?.onBillableWorkStarted,
      });

      if (result.error || !result.persistedAssets?.[0]) {
        throw new Error(result.error ?? `Failed to generate ${angle} angle.`);
      }

      const persisted = result.persistedAssets[0];
      const asset = await createAsset({
        bucket: persisted.bucket,
        storagePath: persisted.storagePath,
        mediaType: persisted.mediaType,
        width: persisted.width ?? null,
        height: persisted.height ?? null,
        source: "generated",
        model: "openai-image",
        prompt,
      });

      await addSheetAngle({ sheetId, assetId: asset.id, angleLabel: angle });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to generate ${angle} angle.`;
      failures.push({ angle, error: message });
    } finally {
      completed += 1;
      onProgress?.(`generating angle ${completed}/${total}…`, completed, total);
    }
  });

  if (failures.length > 0) {
    const failedLabels = failures
      .map((failure) => SHEET_ANGLE_LABELS[failure.angle])
      .join(", ");
    const detail = failures
      .map((failure) => `${SHEET_ANGLE_LABELS[failure.angle]}: ${failure.error}`)
      .join(" ");
    throw new Error(`Failed angle(s): ${failedLabels}. ${detail}`);
  }

  await updateCharacterSheetStatus(sheetId, "ready", null);
  return { status: "ready" };
}

export async function executeSheetGeneration(
  sheetId: string,
  onProgress?: GenerationProgressCallback,
  options?: { abortSignal?: AbortSignal; onBillableWorkStarted?: () => void },
): Promise<{ status: "ready" | "failed"; error?: string }> {
  const userId = await getActiveUserId();
  const estimate = estimateSheetCredits();
  const reference = `openai-image:sheet:${sheetId}`;

  try {
    if (options?.abortSignal) {
      return await withCreditsAbortable(
        userId,
        estimate,
        reference,
        async (ctx) => {
          const result = await runSheetGenerationCore(sheetId, onProgress, {
            abortSignal: options.abortSignal,
            onBillableWorkStarted: () => {
              ctx.markBillableWorkStarted();
              options.onBillableWorkStarted?.();
            },
          });
          return { result, actualCredits: estimate };
        },
        { abortSignal: options.abortSignal },
      );
    }

    return await withCredits(userId, estimate, reference, async () => {
      const result = await runSheetGenerationCore(sheetId, onProgress);
      return { result, actualCredits: estimate };
    });
  } catch (error) {
    if (error instanceof CopilotAbortError) {
      throw error;
    }
    if (isInsufficientCreditsError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Sheet generation failed.";
    await updateCharacterSheetStatus(sheetId, "failed", message);
    return { status: "failed", error: message };
  }
}

export async function queueSheetGeneration(sheetId: string, revalidatePath?: string): Promise<void> {
  await updateCharacterSheetStatus(sheetId, "pending", null);

  after(async () => {
    try {
      await executeSheetGeneration(sheetId);
    } catch (error) {
      if (isInsufficientCreditsError(error)) {
        await updateCharacterSheetStatus(
          sheetId,
          "failed",
          `Not enough credits (need ${error.needed}, have ${error.available}).`,
        );
      }
    }
    if (revalidatePath) {
      const { revalidatePath: revalidate } = await import("next/cache");
      revalidate(revalidatePath);
    }
  });
}
