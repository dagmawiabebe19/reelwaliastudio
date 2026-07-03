"use server";

import { revalidatePath } from "next/cache";
import { queueEpisodeFilmExport } from "@/lib/export/episode-film";
import { verifyEpisodeOwnership } from "@/lib/db/audio-lines";
import { parseUuid } from "@/lib/validation/uuid";

export async function exportEpisodeFilmAction(episodeId: string, seriesId: string) {
  try {
    parseUuid(episodeId, "episodeId");
    parseUuid(seriesId, "seriesId");
    await verifyEpisodeOwnership(episodeId);
    const exportId = await queueEpisodeFilmExport(episodeId, seriesId);
    revalidatePath(`/series/${seriesId}/episodes/${episodeId}`);
    return { exportId, status: "pending" as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Export failed." };
  }
}
