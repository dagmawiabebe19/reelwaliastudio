import "server-only";

import {
  appendSeriesMemoryEntry,
  DEFAULT_SERIES_MEMORY,
  type SeriesMemorySection,
} from "@/lib/series/memory";
import { verifySeriesOwnership } from "@/lib/db/ingredients";
import { getSeries, updateSeries } from "@/lib/db/series";

export async function getSeriesMemoryMarkdown(seriesId: string): Promise<string> {
  const series = await getSeries(seriesId);
  if (!series) throw new Error("Series not found.");
  return series.memory_markdown?.trim() ? series.memory_markdown : DEFAULT_SERIES_MEMORY;
}

export async function updateSeriesMemoryMarkdown(
  seriesId: string,
  memoryMarkdown: string,
): Promise<string> {
  await verifySeriesOwnership(seriesId);
  const updated = await updateSeries(seriesId, { memory_markdown: memoryMarkdown });
  return updated.memory_markdown;
}

export async function appendSeriesMemoryMarkdown(
  seriesId: string,
  entry: string,
  section: SeriesMemorySection = "preferences",
): Promise<string> {
  await verifySeriesOwnership(seriesId);
  const series = await getSeries(seriesId);
  if (!series) throw new Error("Series not found.");

  const current = series.memory_markdown?.trim()
    ? series.memory_markdown
    : DEFAULT_SERIES_MEMORY;
  const next = appendSeriesMemoryEntry(current, entry, section);
  const updated = await updateSeries(seriesId, { memory_markdown: next });
  return updated.memory_markdown;
}
