"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Mic } from "lucide-react";
import { generateLocationAction, retryIngredientAction } from "@/app/(app)/series/[id]/production-actions";
import { generateVoiceAction, mergeVoicesAction } from "@/app/(app)/series/[id]/voice-actions";
import {
  cleanupFailedIngredientsAction,
  deleteIngredientWithCleanupAction,
  getIngredientDeletePreviewAction,
} from "@/app/(app)/series/[id]/delete-actions";
import { CreditCostHint } from "@/components/credits/CreditCostHint";
import { EmptyState } from "@/components/ui/EmptyState";
import { InsufficientCreditsWall } from "@/components/credits/InsufficientCreditsWall";
import { estimateImageCredits } from "@/lib/credits/pricing";
import { RefTag } from "@/components/ui/RefTag";
import { GenerationStatusLine } from "@/components/ui/GenerationStatusLine";
import { StatusDot } from "@/components/ui/StatusDot";
import { usePollWhilePending } from "@/hooks/usePollWhilePending";
import type { IngredientCardData } from "@/lib/production/types";
import { detectVoiceDuplicateGroups } from "@/lib/series/voice-dedupe";
import { IngredientCard } from "./IngredientsSection";
import { IngredientDeleteButton } from "./IngredientDeleteButton";
import { FailedGenerationControls } from "./FailedGenerationControls";

interface LocationsSectionProps {
  seriesId: string;
  locations: IngredientCardData[];
}

export function LocationsSection({ seriesId, locations }: LocationsSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState<{
    needed: number;
    available: number;
  } | null>(null);

  usePollWhilePending(locations.some((l) => l.generationStatus === "pending"));

  const failedLocationCount = locations.filter((l) => l.generationStatus === "failed").length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="font-display text-xl text-foreground">
          Locations <span className="text-muted">({locations.length})</span>
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          {failedLocationCount > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Remove ${failedLocationCount} failed location${failedLocationCount === 1 ? "" : "s"}?`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const result = await cleanupFailedIngredientsAction(seriesId, "location");
                  if (typeof result.error === "string") setError(result.error);
                  else router.refresh();
                });
              }}
              className="studio-btn studio-btn-ghost !min-h-7 !px-2 !py-1 !text-[10px]"
            >
              Clean up failed
            </button>
          ) : null}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setInsufficientCredits(null);
            startTransition(async () => {
              const result = await generateLocationAction(seriesId, new FormData(e.currentTarget));
              if ("insufficientCredits" in result && result.insufficientCredits) {
                setInsufficientCredits(result.insufficientCredits);
              } else if ("error" in result && result.error) {
                setError(result.error);
              } else {
                router.refresh();
              }
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
          <CreditCostHint cost={estimateImageCredits(1)} available={null} />
        </form>
        </div>
      </div>
      {insufficientCredits ? (
        <InsufficientCreditsWall
          needed={insufficientCredits.needed}
          available={insufficientCredits.available}
        />
      ) : null}
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {locations.length === 0 ? (
        <EmptyState
          variant="panel"
          icon={MapPin}
          title="No locations yet"
          description="Describe a location above and generate an establishing shot."
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {locations.map((item) => (
            <IngredientCard key={item.id} ingredient={item} seriesId={seriesId} />
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

function groupVoicesByCharacter(
  voices: IngredientCardData[],
  characters: IngredientCardData[],
): { label: string; voices: IngredientCardData[] }[] {
  const charMap = new Map(characters.map((c) => [c.id, c.name]));
  const byChar = new Map<string | null, IngredientCardData[]>();

  for (const voice of voices) {
    const key = voice.characterId ?? null;
    const list = byChar.get(key) ?? [];
    list.push(voice);
    byChar.set(key, list);
  }

  const groups: { label: string; voices: IngredientCardData[] }[] = [];

  for (const char of characters) {
    const group = byChar.get(char.id);
    if (group?.length) {
      groups.push({
        label: char.name,
        voices: [...group].sort((a, b) => a.name.localeCompare(b.name)),
      });
      byChar.delete(char.id);
    }
  }

  const unlinked = byChar.get(null);
  if (unlinked?.length) {
    groups.push({
      label: "Unlinked",
      voices: [...unlinked].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  for (const [charId, group] of byChar) {
    if (!charId || !group.length) continue;
    groups.push({
      label: charMap.get(charId) ?? "Unknown character",
      voices: [...group].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return groups;
}

export function VoicesSection({ seriesId, voices, characters }: VoicesSectionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const characterNames = useMemo(
    () => new Map(characters.map((c) => [c.id, c.name])),
    [characters],
  );

  const duplicateGroups = useMemo(() => {
    const rows = voices.map((v) => ({
      id: v.id,
      name: v.name,
      characterId: v.characterId ?? null,
      ref_tag: v.ref_tag,
      createdAt: v.createdAt ?? new Date(0).toISOString(),
    }));
    return detectVoiceDuplicateGroups(rows, characterNames);
  }, [voices, characterNames]);

  const voiceGroups = useMemo(
    () => groupVoicesByCharacter(voices, characters),
    [voices, characters],
  );

  const failedVoiceCount = voices.filter((v) => v.generationStatus === "failed").length;

  function confirmAndMerge(group: (typeof duplicateGroups)[number]) {
    const keep = group.voices.find((v) => v.id === group.keepId)!;
    const mergeList = group.voices.filter((v) => group.mergeIds.includes(v.id));
    const lines = [
      `Keep: ${keep.name} (${keep.ref_tag})`,
      "Merge and remove:",
      ...mergeList.map((v) => `  · ${v.name} (${v.ref_tag})`),
    ];
    if (!window.confirm(`${group.label}\n\n${lines.join("\n")}\n\nContinue?`)) return;

    startTransition(async () => {
      const result = await mergeVoicesAction(seriesId, group.keepId, group.mergeIds);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h2 className="font-display text-xl text-foreground">
          Voices <span className="text-muted">({voices.length})</span>
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          {failedVoiceCount > 0 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Remove ${failedVoiceCount} failed voice${failedVoiceCount === 1 ? "" : "s"}?`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const result = await cleanupFailedIngredientsAction(seriesId, "voice");
                  if (typeof result.error === "string") setError(result.error);
                  else router.refresh();
                });
              }}
              className="studio-btn studio-btn-ghost !min-h-7 !px-2 !py-1 !text-[10px]"
            >
              Clean up failed
            </button>
          ) : null}
        <form
          className="flex flex-col items-end gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await generateVoiceAction(seriesId, new FormData(e.currentTarget));
              if (result.error) setError(result.error);
              else router.refresh();
            });
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
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
              Add voice
            </button>
          </div>
          <p className="text-xs text-muted">Described voice — audio generation coming soon.</p>
        </form>
        </div>
      </div>

      {duplicateGroups.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Possible duplicate voices</p>
          {duplicateGroups.map((group) => (
            <div
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="text-muted">
                {group.label} ({group.voices.length} voices)
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirmAndMerge(group)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-elevated disabled:opacity-50"
              >
                Merge duplicates
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {voices.length === 0 ? (
        <EmptyState
          variant="panel"
          icon={Mic}
          title="No voices yet"
          description="Add a voice description to reference in segment prompts."
        />
      ) : (
        <div className="space-y-8">
          {voiceGroups.map((group) => (
            <div key={group.label} className="space-y-3">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted">
                {group.label}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {group.voices.map((voice) => (
                  <article
                    key={voice.id}
                    className="rounded-lg border border-border bg-surface-elevated p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{voice.name}</h3>
                      <div className="flex items-center gap-1">
                        <RefTag tag={voice.ref_tag} />
                        {voice.generationStatus === "failed" ? (
                          <FailedGenerationControls
                            size="md"
                            disabled={pending}
                            onRetry={() => {
                              startTransition(async () => {
                                const result = await retryIngredientAction(voice.id, seriesId);
                                if (typeof result.error === "string") setError(result.error);
                                else router.refresh();
                              });
                            }}
                            fetchDeletePreview={() =>
                              getIngredientDeletePreviewAction(voice.id, seriesId)
                            }
                            onDelete={() => deleteIngredientWithCleanupAction(voice.id, seriesId)}
                            onSuccess={() => router.refresh()}
                          />
                        ) : (
                          <IngredientDeleteButton ingredientId={voice.id} seriesId={seriesId} />
                        )}
                      </div>
                    </div>
                    {voice.characterId ? (
                      <p className="mt-1 text-xs text-muted">
                        Character: {characterNames.get(voice.characterId) ?? "—"}
                      </p>
                    ) : null}
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
