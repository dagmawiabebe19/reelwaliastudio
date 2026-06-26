import type { Orientation } from "@/lib/db/types";

interface StatTilesProps {
  episodeCount: number;
  ingredientCount: number;
  runtimeSeconds: number | null;
}

function formatRuntime(seconds: number | null) {
  if (seconds == null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function StatTiles({ episodeCount, ingredientCount, runtimeSeconds }: StatTilesProps) {
  const tiles = [
    { label: "Episodes", value: String(episodeCount) },
    { label: "Ingredients", value: String(ingredientCount) },
    { label: "Runtime", value: formatRuntime(runtimeSeconds) },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
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
