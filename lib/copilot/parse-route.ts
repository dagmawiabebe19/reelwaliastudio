import type { ParsedStudioRoute } from "@/lib/copilot/workspace-types";

const EPISODE_STUDIO_PATH = /^\/series\/([^/]+)\/episodes\/([^/]+)\/?$/;
const SERIES_PATH = /^\/series\/([^/]+)\/?$/;

export function parseStudioRoute(pathname: string): ParsedStudioRoute {
  const episodeMatch = pathname.match(EPISODE_STUDIO_PATH);
  if (episodeMatch) {
    return {
      seriesId: episodeMatch[1],
      episodeId: episodeMatch[2],
      isEpisodeStudio: true,
      isSeriesRoute: true,
    };
  }

  const seriesMatch = pathname.match(SERIES_PATH);
  if (seriesMatch) {
    return {
      seriesId: seriesMatch[1],
      episodeId: null,
      isEpisodeStudio: false,
      isSeriesRoute: true,
    };
  }

  return {
    seriesId: null,
    episodeId: null,
    isEpisodeStudio: false,
    isSeriesRoute: false,
  };
}
