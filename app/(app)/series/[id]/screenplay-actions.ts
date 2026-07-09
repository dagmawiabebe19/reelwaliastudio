"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getActiveUserId } from "@/lib/auth/getUser";
import {
  createScreenplay,
  getScreenplayById,
  setScreenplayAnalysisApproved,
} from "@/lib/db/screenplays";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { createEpisode } from "@/lib/db/episodes";
import { appendSeriesMemoryMarkdown } from "@/lib/db/series-memory";
import {
  createBreakdownCharacterIngredient,
  createBreakdownLocationIngredient,
} from "@/lib/screenplay/breakdown-ingredients";
import type { ScreenplayFormat } from "@/lib/screenplay/types";

const MAX_SCREENPLAY_BYTES = 52_428_800;
const SCREENPLAY_BUCKET = "references";

const EXT_TO_FORMAT: Record<string, ScreenplayFormat> = {
  ".pdf": "pdf",
  ".fdx": "fdx",
  ".fountain": "fountain",
  ".txt": "txt",
};

function detectFormat(filename: string): ScreenplayFormat | null {
  const lower = filename.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_TO_FORMAT[lower.slice(dot)] ?? null;
}

export async function prepareScreenplayUploadAction(
  seriesId: string,
  input: { filename: string; contentType: string; contentLength: number },
) {
  try {
    await verifySeriesOwnership(seriesId);
    const ownerId = await getActiveUserId();

    if (input.contentLength > MAX_SCREENPLAY_BYTES) {
      return { error: "Screenplay exceeds the 50 MB limit." };
    }

    const format = detectFormat(input.filename);
    if (!format) {
      return { error: "Upload a .pdf, .fdx, .fountain, or .txt screenplay file." };
    }

    const ext = input.filename.includes(".")
      ? input.filename.slice(input.filename.lastIndexOf("."))
      : "";
    const storagePath = `${ownerId}/${seriesId}/screenplays/${randomUUID()}${ext}`;

    return {
      uploadMethod: "direct" as const,
      bucket: "references" as const,
      storagePath,
      format,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to prepare upload.",
    };
  }
}

export async function finalizeScreenplayUploadAction(
  seriesId: string,
  input: {
    bucket: string;
    storagePath: string;
    format: ScreenplayFormat;
    filename: string;
  },
) {
  try {
    await verifySeriesOwnership(seriesId);
    const ownerId = await getActiveUserId();
    const expectedPrefix = `${ownerId}/${seriesId}/screenplays/`;

    if (!input.storagePath.startsWith(expectedPrefix)) {
      return { error: "Storage path does not match the prepared upload." };
    }
    if (input.bucket !== SCREENPLAY_BUCKET) {
      return { error: "Invalid bucket for screenplay upload." };
    }

    const title = input.filename.replace(/\.[^.]+$/, "") || "Screenplay";
    const screenplay = await createScreenplay({
      seriesId,
      title,
      format: input.format,
      storagePath: input.storagePath,
    });

    const { scheduleScreenplayParse } = await import("@/lib/screenplay/parse-sweep");
    scheduleScreenplayParse(screenplay.id);
    revalidatePath(`/series/${seriesId}`);

    return { success: true as const, screenplayId: screenplay.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save screenplay.",
    };
  }
}

export async function estimateScreenplayAnalysisAction(seriesId: string, screenplayId: string) {
  try {
    const { estimateScreenplayAnalysisCredits } = await import("@/lib/credits/pricing");
    await verifySeriesOwnership(seriesId);
    const screenplay = await getScreenplayById(screenplayId);
    if (!screenplay || screenplay.series_id !== seriesId) {
      return { error: "Screenplay not found." };
    }
    if (screenplay.status !== "parsed") {
      return { error: "Screenplay must finish parsing before analysis." };
    }

    return {
      estimateCredits: estimateScreenplayAnalysisCredits(screenplay.scene_count),
      sceneCount: screenplay.scene_count,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not estimate analysis cost.",
    };
  }
}

export async function analyzeScreenplayAction(seriesId: string, screenplayId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const screenplay = await getScreenplayById(screenplayId);
    if (!screenplay || screenplay.series_id !== seriesId) {
      return { error: "Screenplay not found." };
    }

    const userId = await getActiveUserId();
    const { runScreenplayAnalysis } = await import("@/lib/screenplay/analysis/run");
    const proposal = await runScreenplayAnalysis({ screenplayId, userId });
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const, proposal };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Screenplay analysis failed.",
    };
  }
}

export async function approveScreenplayBreakdownAction(
  seriesId: string,
  screenplayId: string,
  input: {
    structure: "faithful" | "vertical";
    characterKeys: string[];
    locationKeys: string[];
    episodeKeys: string[];
  },
) {
  try {
    await verifySeriesOwnership(seriesId);
    const screenplay = await getScreenplayById(screenplayId);
    if (!screenplay || screenplay.series_id !== seriesId) {
      return { error: "Screenplay not found." };
    }
    if (screenplay.analysis_status !== "proposed" || !screenplay.analysis_proposal) {
      return { error: "No breakdown proposal to approve." };
    }

    const proposal = screenplay.analysis_proposal;
    const structure =
      input.structure === "vertical"
        ? proposal.structures.vertical
        : proposal.structures.faithful;

    const selectedCharacters = proposal.characters.filter((c) =>
      input.characterKeys.includes(c.key),
    );
    const selectedLocations = proposal.locations.filter((l) =>
      input.locationKeys.includes(l.key),
    );
    const selectedEpisodes = structure.episodes.filter((ep) =>
      input.episodeKeys.includes(ep.key),
    );

    const created = {
      characters: 0,
      locations: 0,
      episodes: 0,
    };

    for (const character of selectedCharacters) {
      await createBreakdownCharacterIngredient({
        seriesId,
        name: character.name,
        description: character.appearance,
      });
      created.characters += 1;
    }

    for (const location of selectedLocations) {
      await createBreakdownLocationIngredient({
        seriesId,
        name: location.name,
        description: location.description,
      });
      created.locations += 1;
    }

    for (const episode of selectedEpisodes) {
      const sceneNote =
        episode.sceneSortOrders.length > 0
          ? ` Screenplay scenes: ${episode.sceneSortOrders.join(", ")}.`
          : "";
      const extra =
        input.structure === "vertical"
          ? ` Hook: ${episode.hook ?? ""} Cliffhanger: ${episode.cliffhanger ?? ""}`.trim()
          : "";
      const logline = [episode.logline, sceneNote, extra].filter(Boolean).join(" —");
      await createEpisode(seriesId, episode.title, logline);
      created.episodes += 1;
    }

    if (proposal.toneNotes?.trim()) {
      await appendSeriesMemoryMarkdown(seriesId, proposal.toneNotes.trim(), "world");
    }

    const mappingNote = selectedEpisodes
      .map((ep) => `${ep.title} → scenes ${ep.sceneSortOrders.join(", ")}`)
      .join("; ");
    if (mappingNote) {
      await appendSeriesMemoryMarkdown(
        seriesId,
        `Screenplay breakdown (${input.structure}): ${mappingNote}`,
        "preferences",
      );
    }

    await setScreenplayAnalysisApproved(screenplayId);
    revalidatePath(`/series/${seriesId}`);

    return { success: true as const, created };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to approve breakdown.",
    };
  }
}

export async function requeueMissingBreakdownIngredientImagesAction(seriesId: string) {
  try {
    await verifySeriesOwnership(seriesId);
    const { requeueMissingIngredientImages } = await import(
      "@/lib/screenplay/backfill-ingredient-images"
    );
    const result = await requeueMissingIngredientImages({
      seriesId,
      revalidatePath: `/series/${seriesId}`,
    });
    revalidatePath(`/series/${seriesId}`);
    return { success: true as const, ...result };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not requeue ingredient images.",
    };
  }
}
