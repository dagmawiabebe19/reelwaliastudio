"use client";

import { useMemo, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { approveScreenplayBreakdownAction } from "@/app/(app)/series/[id]/screenplay-actions";
import type { ScreenplayBreakdownProposal } from "@/lib/screenplay/analysis/types";

interface ScreenplayBreakdownReviewProps {
  seriesId: string;
  screenplayId: string;
  proposal: ScreenplayBreakdownProposal;
}

export function ScreenplayBreakdownReview({
  seriesId,
  screenplayId,
  proposal,
}: ScreenplayBreakdownReviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [structure, setStructure] = useState<"faithful" | "vertical">("vertical");

  const episodes =
    structure === "vertical"
      ? proposal.structures.vertical.episodes
      : proposal.structures.faithful.episodes;

  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(
    () => new Set(proposal.characters.map((c) => c.key)),
  );
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(
    () => new Set(proposal.locations.map((l) => l.key)),
  );
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(
    () => new Set(episodes.map((ep) => ep.key)),
  );

  const paywallKey =
    structure === "vertical" ? proposal.structures.vertical.paywallEpisodeKey : null;

  const selectionSummary = useMemo(
    () =>
      `${selectedCharacters.size} characters · ${selectedLocations.size} locations · ${selectedEpisodes.size} episodes`,
    [selectedCharacters.size, selectedLocations.size, selectedEpisodes.size],
  );

  function toggle(setter: Dispatch<SetStateAction<Set<string>>>, key: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveScreenplayBreakdownAction(seriesId, screenplayId, {
        structure,
        characterKeys: [...selectedCharacters],
        locationKeys: [...selectedLocations],
        episodeKeys: [...selectedEpisodes],
      });
      if ("error" in result) {
        setError(result.error ?? "Failed to approve breakdown.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-5 rounded-md border border-accent/30 bg-surface-elevated p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-foreground">Breakdown proposal</h3>
          <p className="mt-1 text-sm text-muted">
            Select what to import. Creates described ingredients and episode shells only — no image or video generation.
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5 text-sm">
          {(
            [
              ["faithful", "Faithful"],
              ["vertical", "Vertical"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStructure(key);
                const nextEpisodes =
                  key === "vertical"
                    ? proposal.structures.vertical.episodes
                    : proposal.structures.faithful.episodes;
                setSelectedEpisodes(new Set(nextEpisodes.map((ep) => ep.key)));
              }}
              className={`rounded px-3 py-1 ${
                structure === key ? "bg-accent text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {proposal.toneNotes ? (
        <p className="text-sm text-muted">
          <span className="text-foreground/80">Tone:</span> {proposal.toneNotes}
        </p>
      ) : null}

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Characters</h4>
        <div className="space-y-2">
          {proposal.characters.map((character) => (
            <label
              key={character.key}
              className="flex cursor-pointer gap-3 rounded border border-border/70 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedCharacters.has(character.key)}
                onChange={() => toggle(setSelectedCharacters, character.key)}
              />
              <span>
                <span className="font-medium text-foreground">{character.name}</span>
                <span className="text-muted"> · {character.sceneCount} scenes</span>
                <p className="mt-1 text-muted">{character.appearance}</p>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Locations</h4>
        <div className="space-y-2">
          {proposal.locations.map((location) => (
            <label
              key={location.key}
              className="flex cursor-pointer gap-3 rounded border border-border/70 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedLocations.has(location.key)}
                onChange={() => toggle(setSelectedLocations, location.key)}
              />
              <span>
                <span className="font-medium text-foreground">{location.name}</span>
                <p className="mt-1 text-muted">{location.description}</p>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Episodes ({structure})</h4>
        <div className="space-y-2">
          {episodes.map((episode) => (
            <label
              key={episode.key}
              className="flex cursor-pointer gap-3 rounded border border-border/70 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedEpisodes.has(episode.key)}
                onChange={() => toggle(setSelectedEpisodes, episode.key)}
              />
              <span>
                <span className="font-medium text-foreground">
                  {episode.title}
                  {paywallKey === episode.key ? (
                    <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
                      Suggested paywall
                    </span>
                  ) : null}
                </span>
                <p className="mt-1 text-muted">{episode.logline}</p>
                <p className="mt-1 text-xs text-muted">
                  Scenes {episode.sceneSortOrders.join(", ")}
                  {episode.hook ? ` · Hook: ${episode.hook}` : ""}
                  {episode.cliffhanger ? ` · Cliff: ${episode.cliffhanger}` : ""}
                </p>
              </span>
            </label>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm text-muted">{selectionSummary}</p>
        <button
          type="button"
          disabled={pending}
          onClick={handleApprove}
          className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Approve selected
        </button>
      </div>
    </div>
  );
}
