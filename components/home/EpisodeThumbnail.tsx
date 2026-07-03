"use client";

import { useState } from "react";

interface EpisodeThumbnailProps {
  url: string | null;
  initial: string;
  className?: string;
}

/** Home list thumbnail — signed still or branded series-initial tile (never a broken icon). */
export function EpisodeThumbnail({ url, initial, className = "size-14" }: EpisodeThumbnailProps) {
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${className} shrink-0 rounded-md object-cover`}
        onError={() => setBroken(true)}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-elevated font-display text-lg font-semibold text-accent`}
      aria-hidden
    >
      {initial}
    </div>
  );
}
