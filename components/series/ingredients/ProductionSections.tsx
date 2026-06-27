"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateLocationAction } from "@/app/(app)/series/[id]/production-actions";
import { generateVoiceAction } from "@/app/(app)/series/[id]/voice-actions";
import { RefTag } from "@/components/ui/RefTag";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { StatusDot } from "@/components/ui/StatusDot";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { IngredientCardData } from "@/lib/production/types";
import { IngredientCard } from "./IngredientsSection";

interface LocationsSectionProps {
  seriesId: string;
  locations: IngredientCardData[];
}

export function LocationsSection({ seriesId, locations }: LocationsSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  usePollWhilePending(locations.some((l) => l.generationStatus === "pending"));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="font-display text-xl text-foreground">
          Locations <span className="text-muted">({locations.length})</span>
        </h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await generateLocationAction(seriesId, new FormData(e.currentTarget));
              if (result.error) setError(result.error);
              else router.refresh();
            });
          }}
        >
          <input
            name="name"
            required
            placeholder="Name"
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          />
          <input
            name="description"
            required
            placeholder="Location description…"
            className="min-w-[14rem] rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            Generate from description
          </button>
        </form>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {locations.length === 0 ? (
        <p className="text-sm text-muted">No locations yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {locations.map((item) => (
            <IngredientCard key={item.id} ingredient={item} />
          ))}
        </div>
      )}
    </section>
  );
}

interface VoicesSectionProps {
  seriesId: string;
  voices: IngredientCardData[];
  characters: IngredientCardData[];
}

export function VoicesSection({ seriesId, voices, characters }: VoicesSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="font-display text-xl text-foreground">
          Voices <span className="text-muted">({voices.length})</span>
        </h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setInfo(null);
            startTransition(async () => {
              const result = await generateVoiceAction(seriesId, new FormData(e.currentTarget));
              if (result.error) setError(result.error);
              else {
                if (result.stub) setInfo(result.error ?? "Voice provider not configured.");
                router.refresh();
              }
            });
          }}
        >
          <input
            name="name"
            required
            placeholder="Voice name"
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          />
          <input
            name="description"
            required
            placeholder="Timbre, age, accent, pace…"
            className="min-w-[14rem] rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-sm"
          />
          <select
            name="characterId"
            className="rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-sm"
            defaultValue=""
          >
            <option value="">No character link</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            Add voice (generation stubbed)
          </button>
        </form>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {info ? <p className="text-sm text-muted">{info}</p> : null}
      {voices.length === 0 ? (
        <p className="text-sm text-muted">No voices yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {voices.map((voice) => (
            <article
              key={voice.id}
              className="rounded-lg border border-border bg-surface-elevated p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{voice.name}</h3>
                <RefTag tag={voice.ref_tag} />
              </div>
              {voice.description ? (
                <p className="mt-2 text-sm text-muted">{voice.description}</p>
              ) : null}
              <GenerationStatusLine
                status={voice.generationStatus}
                error={voice.generationError}
              />
              {voice.generationStatus && voice.generationStatus !== "ready" ? (
                <div className="mt-2">
                  <StatusDot variant="open" label={voice.generationStatus} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
