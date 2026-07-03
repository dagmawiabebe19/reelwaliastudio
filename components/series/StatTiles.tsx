import type { Orientation } from "@/lib/db/types";

interface StatTilesProps {
  episodeCount: number;
  characterCount: number;
  locationCount: number;
  voiceCount: number;
}

export function StatTiles({
  episodeCount,
  characterCount,
  locationCount,
  voiceCount,
}: StatTilesProps) {
  const tiles = [
    { label: "Episodes", value: String(episodeCount) },
    { label: "Characters", value: String(characterCount) },
    { label: "Locations", value: String(locationCount) },
    { label: "Voices", value: String(voiceCount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-border bg-surface px-5 py-4"
        >
          <p className="text-xs uppercase tracking-widest text-muted">{tile.label}</p>
          <p className="mt-2 font-display text-3xl text-foreground">{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

export function orientationLabel(orientation: Orientation) {
  return orientation === "portrait" ? "Portrait 9:16" : "Landscape 16:9";
}
