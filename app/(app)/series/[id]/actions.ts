"use server";

import { revalidatePath } from "next/cache";
import type { Orientation } from "@/lib/db/database.types";
import { updateSeriesBrief, updateSeriesOrientation } from "@/lib/db/series";

export async function updateSeriesBriefAction(seriesId: string, briefMarkdown: string) {
  try {
    await updateSeriesBrief(seriesId, briefMarkdown);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save brief." };
  }
}

export async function updateSeriesOrientationAction(seriesId: string, orientation: Orientation) {
  try {
    await updateSeriesOrientation(seriesId, orientation);
    revalidatePath(`/series/${seriesId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to update orientation.",
    };
  }
}
