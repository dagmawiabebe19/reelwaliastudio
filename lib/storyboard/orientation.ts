import type { Orientation } from "@/lib/db/types";

export function effectiveOrientation(
  sceneOrientation: Orientation | null,
  seriesDefault: Orientation,
): Orientation {
  return sceneOrientation ?? seriesDefault;
}
