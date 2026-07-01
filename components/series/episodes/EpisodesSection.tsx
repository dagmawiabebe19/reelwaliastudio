"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Clapperboard } from "lucide-react";
import {
  createEpisodeAction,
  setEpisodeStatusAction,
} from "@/app/(app)/series/[id]/actions";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import type { EpisodeStatus } from "@/lib/db/types";

export type EpisodeCardData = {
  id: string;
  title: string;
  logline: string | null;
  status: EpisodeStatus;
  updated_at: string;
  scene_count: number;
};

interface EpisodesSectionProps {
  seriesId: string;
  activeEpisodes: EpisodeCardData[];
  archivedEpisodes: EpisodeCardData[];
  showOnboarding?: boolean;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function EpisodesSection({
  seriesId,
  activeEpisodes,
  archivedEpisodes,
  showOnboarding = false,
}: EpisodesSectionProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [pending, startTransition] = useTransition();
  const episodes = tab === "active" ? activeEpisodes : archivedEpisodes;

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createEpisodeAction(seriesId, formData);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  function toggleArchive(episodeId: string, status: EpisodeStatus) {
    startTransition(async () => {
      const next = status === "active" ? "archived" : "active";
      const result = await setEpisodeStatusAction(episodeId, seriesId, next);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="inline-flex rounded-md border border-border p-1">
        {(["active", "archived"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm capitalize ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted hover:text-accent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate(new FormData(e.currentTarget));
        }}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs text-muted">New episode</label>
          <input
            name="title"
            required
            placeholder="Episode title"
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm focus-ring focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="min-w-[16rem] flex-[2]">
          <label className="mb-1 block text-xs text-muted">Logline</label>
          <input
            name="logline"
            placeholder="One-line summary"
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm focus-ring focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "New Episode"}
        </Button>
      </form>

      <div className="grid gap-4">
        {episodes.length === 0 ? (
          <div className="space-y-6">
            {showOnboarding && tab === "active" ? (
              <OnboardingGuide phase="plan-episode" />
            ) : null}
            {tab === "archived" ? (
            <EmptyState
              variant="panel"
              icon={Archive}
              title="No archived episodes"
              description="Archive an episode from the Active tab when you want to park it."
            />
            ) : (
              <EmptyState
                variant="panel"
                icon={Clapperboard}
                title="No episodes yet"
                description="Create your first episode above, then open the studio to plan segments."
              />
            )}
          </div>
        ) : (
          episodes.map((ep) => (
            <article
              key={ep.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-5"
            >
              <div>
                <Link
                  href={`/series/${seriesId}/episodes/${ep.id}`}
                  className="font-display text-lg text-foreground hover:text-accent"
                >
                  {ep.title}
                </Link>
                {ep.logline ? <p className="mt-1 text-sm text-muted">{ep.logline}</p> : null}
                <p className="mt-2 text-xs text-muted">
                  {ep.scene_count} scenes · Updated {formatDate(ep.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleArchive(ep.id, ep.status)}
                  disabled={pending}
                >
                  {ep.status === "active" ? "Archive" : "Unarchive"}
                </Button>
                <Link href={`/series/${seriesId}/episodes/${ep.id}`}>
                  <Button type="button" variant="ghost">
                    Storyboard
                  </Button>
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
