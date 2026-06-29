import type { TakeCardData } from "@/components/series/generation/TakesStrip";
import type { Orientation } from "@/lib/db/types";

/** Starred ready take, else latest ready image, else latest ready video. */
export function resolveRepresentativeTake(takes: TakeCardData[]): TakeCardData | null {
  const ready = takes.filter((take) => take.status === "ready" && take.assetUrl);
  const starred = ready.find((take) => take.starred);
  if (starred) return starred;

  const images = ready.filter((take) => take.media_type === "image");
  if (images.length) return images[images.length - 1];

  const videos = ready.filter((take) => take.media_type === "video");
  if (videos.length) return videos[videos.length - 1];

  return null;
}

export function countReadyTakes(takes: TakeCardData[]): number {
  return takes.filter((take) => take.status === "ready").length;
}

export function orientationAspectClass(orientation: Orientation): string {
  return orientation === "portrait" ? "aspect-[9/16]" : "aspect-video";
}

export function takeStatusRingClass(status: string, active: boolean): string {
  if (active) return "ring-2 ring-status-validated shadow-[0_0_0_1px_var(--status-validated)]";
  switch (status) {
    case "ready":
      return "ring-1 ring-status-released/70";
    case "pending":
      return "ring-1 ring-status-progress/80";
    case "failed":
      return "ring-1 ring-accent/40";
    default:
      return "ring-1 ring-border";
  }
}
