import "server-only";

import { after } from "next/server";

import { getActiveUserId } from "@/lib/auth/getUser";
import { CopilotAbortError, throwIfAborted } from "@/lib/ai/copilot/abort";
import { isInsufficientCreditsError } from "@/lib/credits/errors";
import { estimateSheetCredits } from "@/lib/credits/pricing";
import { withCredits, withCreditsAbortable } from "@/lib/credits/meter";
import { runOpenAiImage } from "@/lib/ai/image/openai-image";
import { runSeedream } from "@/lib/ai/image/seedream";
import {
  runWithConcurrencySettled,
  SHEET_ANGLE_CONCURRENCY,
} from "@/lib/ai/generation/concurrency";
import {
  classifyImageError,
  moderationUserMessage,
} from "@/lib/ai/generation/image-errors";
import { withImageRetries } from "@/lib/ai/generation/image-retry";
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
import type { GenerateImageInput } from "@/lib/ai/image/types";

const SHEET_ANGLES: SheetAngle[] = [
  "front",
  "left_profile",
  "right_profile",
  "three_quarter",
  "back",
];

function safeProgress(
  onProgress: GenerationProgressCallback | undefined,
  message: string,
  step: number,
  total: number,
): void {
  try {
    onProgress?.(message, step, total);
  } catch (error) {
    console.warn("[sheet-generation] progress callback failed (stream may be closed)", {
      message,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runImageForAngle(
  input: GenerateImageInput,
  options?: { preferSeedreamOnModeration?: boolean },
): Promise<{ persisted: NonNullable<Awaited<ReturnType<typeof runOpenAiImage>>["persistedAssets"]>[0] }> {
  const openAiResult = await withImageRetries(
    `sheet-angle:${input.sceneId}`,
    () => runOpenAiImage(input),
    { abortSignal: input.abortSignal },
  );

  if (!openAiResult.error && openAiResult.persistedAssets?.[0]) {
    return { persisted: openAiResult.persistedAssets[0] };
  }

  const openAiError = openAiResult.error ?? "Failed to generate angle.";
  const classified = classifyImageError(new Error(openAiError));

  if (
    classified.category === "moderation" &&
    options?.preferSeedreamOnModeration
  ) {
    const seedreamResult = await runSeedream(input);
    if (!seedreamResult.error && seedreamResult.persistedAssets?.[0]) {
      return { persisted: seedreamResult.persistedAssets[0] };
    }
    if (seedreamResult.error?.includes("pending integration")) {
      throw new Error(moderationUserMessage());
    }
    if (seedreamResult.error) {
      throw new Error(`${moderationUserMessage()} (${seedreamResult.error})`);
    }
  }

  if (classified.category === "moderation") {
    throw new Error(moderationUserMessage());
  }

  throw new Error(openAiError);
}

async function generateSheetAngle(input: {
  sheetId: string;
  angle: SheetAngle;
  prompt: string;
  refUrls: string[];
  abortSignal?: AbortSignal;
  onBillableWorkStarted?: () => void;
}): Promise<void> {
  const imageInput: GenerateImageInput = {
    prompt: input.prompt,
    refImageUrls: input.refUrls,
    aspectRatio: defaultAspectRatioForIngredients(),
    count: 1,
    resolution: "720p",
    safety: "sfw",
    sceneId: input.sheetId,
    abortSignal: input.abortSignal,
    onBillableWorkStarted: input.onBillableWorkStarted,
  };

  const { persisted } = await runImageForAngle(imageInput, {
    preferSeedreamOnModeration: true,
  });

  const asset = await createAsset({
    bucket: persisted.bucket,
    storagePath: persisted.storagePath,
    mediaType: persisted.mediaType,
    width: persisted.width ?? null,
    height: persisted.height ?? null,
    source: "generated",
    model: "openai-image",
    prompt: input.prompt,
  });

  await addSheetAngle({
    sheetId: input.sheetId,
    assetId: asset.id,
    angleLabel: input.angle,
  });
}

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

  const existingAngles = new Set(
    sheet.angles.map((angle) => angle.angle_label as SheetAngle),
  );
  const anglesToGenerate = SHEET_ANGLES.filter((angle) => !existingAngles.has(angle));

  if (anglesToGenerate.length === 0) {
    await updateCharacterSheetStatus(sheetId, "ready", null);
    return { status: "ready" };
  }

  await updateCharacterSheetStatus(sheetId, "pending", null);

  const total = SHEET_ANGLES.length;
  const failures: Array<{ angle: SheetAngle; error: string }> = [];

  const settled = await runWithConcurrencySettled(
    anglesToGenerate,
    SHEET_ANGLE_CONCURRENCY,
    async (angle) => {
      throwIfAborted(options?.abortSignal);
      const prompt = sheetAnglePrompt(angle, characterName, costumeNote);
      await generateSheetAngle({
        sheetId,
        angle,
        prompt,
        refUrls,
        abortSignal: options?.abortSignal,
        onBillableWorkStarted: options?.onBillableWorkStarted,
      });
      return angle;
    },
  );

  let completed = existingAngles.size;
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const angle = anglesToGenerate[i];
    if (result.status === "rejected") {
      if (result.reason instanceof CopilotAbortError) {
        throw result.reason;
      }
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : `Failed to generate ${angle} angle.`;
      failures.push({ angle, error: message });
    }
    completed += 1;
    safeProgress(onProgress, `generating angle ${completed}/${total}…`, completed, total);
  }

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

async function runQueuedSheetGeneration(sheetId: string, revalidatePath?: string): Promise<void> {
  try {
    await executeSheetGeneration(sheetId);
  } catch (error) {
    if (isInsufficientCreditsError(error)) {
      await updateCharacterSheetStatus(
        sheetId,
        "failed",
        `Not enough credits (need ${error.needed}, have ${error.available}).`,
      );
    } else if (!(error instanceof CopilotAbortError)) {
      const message = error instanceof Error ? error.message : "Sheet generation failed.";
      await updateCharacterSheetStatus(sheetId, "failed", message);
    }
  }

  if (revalidatePath) {
    const { revalidatePath: revalidate } = await import("next/cache");
    revalidate(revalidatePath);
  }
}

export async function queueSheetGeneration(sheetId: string, revalidatePath?: string): Promise<void> {
  await updateCharacterSheetStatus(sheetId, "pending", null);

  after(async () => {
    try {
      await runQueuedSheetGeneration(sheetId, revalidatePath);
    } catch (error) {
      console.error("[sheet-generation] queued generation failed", {
        sheetId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export async function retrySheetGeneration(
  sheetId: string,
  revalidatePath?: string,
): Promise<{ status: "ready" | "failed"; error?: string }> {
  const sheet = await getCharacterSheet(sheetId);
  if (!sheet) return { status: "failed", error: "Character sheet not found." };
  if (sheet.status === "pending") {
    return { status: "failed", error: "Sheet is already generating." };
  }

  await updateCharacterSheetStatus(sheetId, "pending", null);
  const result = await executeSheetGeneration(sheetId);
  if (revalidatePath) {
    const { revalidatePath: revalidate } = await import("next/cache");
    revalidate(revalidatePath);
  }
  return result;
}
