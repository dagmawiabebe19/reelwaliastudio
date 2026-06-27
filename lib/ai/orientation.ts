import type { Orientation } from "@/lib/db/types";
import type { AspectRatio } from "@/lib/ai/registry";

export function orientationToAspectRatio(orientation: Orientation): AspectRatio {
  return orientation === "portrait" ? "9:16" : "16:9";
}

export function resolutionLabelToPixels(
  resolution: string,
  aspectRatio: AspectRatio,
): { width: number; height: number } {
  const shortEdge = resolution === "720p" ? 720 : 480;
  if (aspectRatio === "9:16") {
    return { width: shortEdge, height: Math.round((shortEdge * 16) / 9) };
  }
  return { width: Math.round((shortEdge * 16) / 9), height: shortEdge };
}
