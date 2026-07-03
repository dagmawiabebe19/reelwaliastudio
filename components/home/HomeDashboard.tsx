"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { EpisodeThumbnail } from "@/components/home/EpisodeThumbnail";
import { RefTag } from "@/components/ui/RefTag";
import { StatusDot } from "@/components/ui/StatusDot";
import { CreditBalanceBadge } from "@/components/credits/CreditBalanceBadge";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import { formatCredits } from "@/lib/credits/format";
import type {
  HomeDashboardData,
  HomeGeneratingTake,
  HomeRecentEpisode,
} from "@/lib/dashboard/home-data";

interface HomeDashboardProps extends HomeDashboardData {
  isAdmin: boolean;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

function EpisodeRow({ episode }: { episode: HomeRecentEpisode }) {
  const href = `/series/${episode.seriesId}/episodes/${episode.id}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
    >
      <EpisodeThumbnail url={episode.thumbnailUrl} initial={episode.thumbnailInitial} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{episode.title}</p>
        <p className="truncate text-sm text-muted">{episode.seriesTitle}</p>
      </div>
      <span className="shrink-0 text-xs text-muted">{formatRelativeTime(episode.updatedAt)}</span>
    </Link>
  );
}

function GeneratingRow({ take }: { take: HomeGeneratingTake }) {
  const href = `/series/${take.seriesId}/episodes/${take.episodeId}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-elevated"
    >
      <EpisodeThumbnail url={take.thumbnailUrl} initial={take.thumbnailInitial} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {take.episodeTitle}
          {take.sceneTitle ? (
            <span className="font-normal text-muted"> · {take.sceneTitle}</span>
          ) : null}
        </p>
        <p className="text-sm text-muted">
          {take.seriesTitle} · Take {take.takeNumber}
        </p>
      </div>
      <StatusDot variant="in_progress" label="Generating" />
    </Link>
  );
}

export function HomeDashboard({
  recentEpisodes,
  generatingTakes,
  balance,
  isAdmin,
}: HomeDashboardProps) {
  const hasGenerating = generatingTakes.length > 0;

  usePollWhilePending(hasGenerating, 4000);

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Home</h1>
        <p className="max-w-2xl text-sm text-muted">
          Pick up where you left off — projects contain series, and series contain episodes.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{isAdmin ? "Admin usage" : "Credits"}:</span>
        <CreditBalanceBadge available={balance.available} adminMode={isAdmin} compact />
        {!isAdmin && balance.reserved > 0 ? (
          <span className="text-xs">({formatCredits(balance.reserved)} reserved)</span>
        ) : null}
        <Link href="/credits" className="text-accent hover:underline">
          View ledger →
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-xl text-foreground">Continue where you left off</h2>
        {recentEpisodes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No episodes yet.{" "}
            <Link href="/projects" className="text-accent hover:underline">
              Open a project
            </Link>{" "}
            to create a series and start an episode.
          </p>
        ) : (
          <div className="space-y-2">
            {recentEpisodes.map((ep) => (
              <EpisodeRow key={ep.id} episode={ep} />
            ))}
          </div>
        )}
      </section>

      {hasGenerating ? (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-xl text-foreground">
            <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
            Generating now
          </h2>
          <div className="space-y-2">
            {generatingTakes.map((take) => (
              <GeneratingRow key={take.id} take={take} />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="border-t border-border pt-6 text-xs text-muted">
        <p className="flex flex-wrap items-center gap-3">
          <StatusDot variant="open" label="Open" />
          <StatusDot variant="in_progress" label="In progress" />
          <StatusDot variant="validated" label="Validated" />
          <StatusDot variant="released" label="Released" />
        </p>
        <p className="mt-3">
          Reference ingredients with tags like <RefTag tag="image10" />{" "}
          <RefTag tag="voice4" /> in prompts.
        </p>
      </footer>
    </div>
  );
}
