export const SERIES_MEMORY_WORLD_HEADER = "## World";
export const SERIES_MEMORY_PREFERENCES_HEADER = "## Decisions & preferences";

export const DEFAULT_SERIES_MEMORY = `${SERIES_MEMORY_WORLD_HEADER}

Characters, locations, tone, and canonical looks for this series.

${SERIES_MEMORY_PREFERENCES_HEADER}

Running log of corrections and rules for this series.
`;

export type SeriesMemorySection = "world" | "preferences";

export function appendSeriesMemoryEntry(
  current: string,
  entry: string,
  section: SeriesMemorySection = "preferences",
): string {
  const trimmed = entry.trim();
  if (!trimmed) return current;

  const base = current.trim() || DEFAULT_SERIES_MEMORY;
  const header =
    section === "world" ? SERIES_MEMORY_WORLD_HEADER : SERIES_MEMORY_PREFERENCES_HEADER;
  const line =
    section === "preferences"
      ? `- ${new Date().toISOString().slice(0, 10)}: ${trimmed}`
      : `- ${trimmed}`;

  const headerIdx = base.indexOf(header);
  if (headerIdx === -1) {
    return `${base.trimEnd()}\n\n${header}\n${line}`;
  }

  const afterHeader = headerIdx + header.length;
  const rest = base.slice(afterHeader);
  const nextSectionOffset = rest.search(/\n## /);
  const insertPos =
    nextSectionOffset === -1 ? base.length : afterHeader + nextSectionOffset;

  const before = base.slice(0, insertPos).trimEnd();
  const after = insertPos < base.length ? base.slice(insertPos) : "";
  return after ? `${before}\n${line}\n${after.trimStart()}` : `${before}\n${line}`;
}
