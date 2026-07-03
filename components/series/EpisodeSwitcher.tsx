"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { Episode } from "@/lib/db/types";
import { ICON_MD, ICON_STROKE } from "@/components/ui/icon";

interface EpisodeSwitcherProps {
  seriesId: string;
  episodeId: string;
  episodes: Episode[];
}

export function EpisodeSwitcher({ seriesId, episodeId, episodes }: EpisodeSwitcherProps) {
  const router = useRouter();

  if (episodes.length <= 1) {
    const current = episodes.find((ep) => ep.id === episodeId);
    return (
      <p
        className="studio-column-heading-sm truncate font-display text-foreground"
        title={current?.title ?? "Episode"}
      >
        {current?.title ?? "Episode"}
      </p>
    );
  }

  const active = episodes.filter((ep) => ep.status === "active");
  const archived = episodes.filter((ep) => ep.status === "archived");
  const ordered = [...active, ...archived];

  return (
    <div className="relative inline-flex max-w-full items-center">
      <label htmlFor="episode-switcher" className="sr-only">
        Switch episode
      </label>
      <select
        id="episode-switcher"
        value={episodeId}
        onChange={(e) => {
          const nextId = e.target.value;
          if (nextId && nextId !== episodeId) {
            router.push(`/series/${seriesId}/episodes/${nextId}`);
          }
        }}
        className="studio-episode-switcher appearance-none truncate pr-7 font-display text-sm font-medium text-foreground"
        title="Switch episode"
      >
        {active.length > 0 ? (
          <optgroup label="Episodes">
            {active.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.title}
              </option>
            ))}
          </optgroup>
        ) : null}
        {archived.length > 0 ? (
          <optgroup label="Archived">
            {archived.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.title}
              </option>
            ))}
          </optgroup>
        ) : null}
        {active.length === 0 && archived.length === 0
          ? ordered.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.title}
              </option>
            ))
          : null}
      </select>
      <ChevronDown
        className={`${ICON_MD} pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-muted`}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
    </div>
  );
}
