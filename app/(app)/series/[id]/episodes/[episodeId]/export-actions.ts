"use server";

import { revalidatePath } from "next/cache";
import { queueEpisodeFilmExport } from "@/lib/export/episode-film";

export async function exportEpisodeFilmAction(episodeId: string, seriesId: string) {
  try {
    const exportId = await queueEpisodeFilmExport(episodeId, seriesId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { exportId, status: "pending" as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Export failed." };
  }
}
