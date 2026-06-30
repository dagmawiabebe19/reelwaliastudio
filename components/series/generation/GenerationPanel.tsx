"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateTakesAction } from "@/app/(app)/series/[id]/episodes/[episodeId]/generation-actions";
import { getMyCreditBalanceAction } from "@/app/(app)/credits/balance-action";
import { Button } from "@/components/ui/Button";
import { CreditCostHint } from "@/components/credits/CreditCostHint";
import { InsufficientCreditsWall } from "@/components/credits/InsufficientCreditsWall";
import { estimateVideoCredits } from "@/lib/credits/pricing";
import {
  SEEDANCE_AUDIO_MODE_OPTIONS,
  SEEDANCE_DURATION_OPTIONS,
  SEEDANCE_TIER_OPTIONS,
  type SeedanceAudioMode,
} from "@/lib/ai/video/seedance-constants";
import {
  SHOT_INTENTS,
  SHOT_INTENT_LABELS,
  inferDefaultShotIntent,
  normalizeShotIntent,
  type ShotIntent,
} from "@/lib/production/prompts";
import type { ResolvedReference } from "@/lib/production/types";

interface GenerationPanelProps {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  seedanceConfigured: boolean;
  scenePrompt?: string | null;
  shotIntent?: string | null;
  resolvedReferences?: ResolvedReference[];
}

function formatSeedanceRefLabel(ref: ResolvedReference): string {
  if (ref.type === "location") return ref.label;
  if (ref.type === "character_sheet") {
    const name = ref.label.split(" · ")[0] ?? ref.label;
    return `${name} sheet`;
  }
  return ref.label.replace(/ \(headshot.*\)/i, "");
}

function seedanceReferenceLabels(refs: ResolvedReference[]): string[] {
  return refs
    .filter(
      (ref) =>
        (ref.type === "character_sheet" || ref.type === "location" || ref.type === "ingredient") &&
        ref.assetUrls.length > 0,
    )
    .map(formatSeedanceRefLabel);
}

function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="block studio-section-label">{children}</label>
      {hint ? <p className="mt-0.5 text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

const selectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60";

export function GenerationPanel({
  sceneId,
  seriesId,
  episodeId,
  seedanceConfigured,
  scenePrompt = "",
  shotIntent: initialShotIntent = null,
  resolvedReferences = [],
}: GenerationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [resolution, setResolution] = useState<"480p" | "720p">("720p");
  const [duration, setDuration] = useState(8);
  const [seedanceTier, setSeedanceTier] = useState<string>(SEEDANCE_TIER_OPTIONS[0].id);
  const [seedanceAudioMode, setSeedanceAudioMode] = useState<SeedanceAudioMode>("off");
  const [shotIntent, setShotIntent] = useState<ShotIntent>(
    () =>
      normalizeShotIntent(initialShotIntent) ??
      inferDefaultShotIntent(scenePrompt ?? ""),
  );
  const [startedMessage, setStartedMessage] = useState<string | null>(null);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [insufficientCredits, setInsufficientCredits] = useState<{
    needed: number;
    available: number;
  } | null>(null);

  const estimatedCost = useMemo(
    () =>
      estimateVideoCredits({
        tier: seedanceTier as "standard" | "fast",
        resolution,
        durationSeconds: duration,
      }),
    [seedanceTier, resolution, duration],
  );

  const seedanceRefLabels = useMemo(
    () => seedanceReferenceLabels(resolvedReferences),
    [resolvedReferences],
  );
  const canGenerate = seedanceConfigured && seedanceRefLabels.length > 0;

  useEffect(() => {
    setShotIntent(
      normalizeShotIntent(initialShotIntent) ??
        inferDefaultShotIntent(scenePrompt ?? ""),
    );
  }, [sceneId, initialShotIntent, scenePrompt]);

  useEffect(() => {
    void getMyCreditBalanceAction().then((result) => {
      if (result.balance) {
        setAvailableCredits(result.balance.available);
      }
      if (result.isAdmin) {
        setUserIsAdmin(true);
      }
    });
  }, []);

  function handleGenerate() {
    if (!canGenerate) return;

    startTransition(async () => {
      setStartedMessage(null);
      setInsufficientCredits(null);
      const result = await generateTakesAction({
        sceneId,
        seriesId,
        episodeId,
        resolution,
        durationSeconds: duration,
        seedanceTier: seedanceTier as "standard" | "fast",
        seedanceAudioMode,
        shotIntent,
      });

      if ("error" in result && result.error) {
        if (result.insufficientCredits) {
          setInsufficientCredits(result.insufficientCredits);
        } else {
          alert(result.error);
        }
      } else {
        setStartedMessage(
          `Generating video from ${seedanceRefLabels.length} reference${seedanceRefLabels.length === 1 ? "" : "s"}… may take several minutes`,
        );
        const balance = await getMyCreditBalanceAction();
        if (balance.balance) {
          setAvailableCredits(balance.balance.available);
        }
        if (balance.isAdmin) {
          setUserIsAdmin(true);
        }
        router.refresh();
      }
    });
  }

  return (
    <div className="studio-panel-calm space-y-5">
      <div className="space-y-1">
        <span className="studio-segment-panel-badge">This segment</span>
        <h3 className="studio-section-label mt-2">New take</h3>
        <p className="text-[10px] leading-relaxed text-muted">
          Seedance generates video from bound ingredient references and your shot prompt.
        </p>
      </div>

      <div className="rounded-md border border-border/60 bg-background/30 px-3 py-2.5">
        <p className="studio-section-label">Model</p>
        <p className="mt-1 text-sm text-foreground">Seedance 2.0</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          References + text → video in one pass. No intermediate still required.
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-border/60 bg-background/30 p-3">
        <div>
          <FieldLabel>References</FieldLabel>
          {seedanceRefLabels.length ? (
            <p className="text-sm text-foreground">{seedanceRefLabels.join(", ")}</p>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Bind a character sheet or location to generate — mention them in the segment prompt to
              auto-bind references.
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Shot intent</FieldLabel>
          <select
            value={shotIntent}
            onChange={(e) => setShotIntent(e.target.value as ShotIntent)}
            className={selectClass}
          >
            {SHOT_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {SHOT_INTENT_LABELS[intent]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Tier</FieldLabel>
          <select
            value={seedanceTier}
            onChange={(e) => setSeedanceTier(e.target.value)}
            className={selectClass}
          >
            {SEEDANCE_TIER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 rounded-md border border-border/40 bg-background/20 p-3">
          <FieldLabel>Native audio</FieldLabel>
          <select
            value={seedanceAudioMode}
            onChange={(e) => setSeedanceAudioMode(e.target.value as SeedanceAudioMode)}
            className={selectClass}
          >
            {SEEDANCE_AUDIO_MODE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] leading-relaxed text-muted">
            {seedanceAudioMode === "off"
              ? "Silent clip — generate_audio=false."
              : seedanceAudioMode === "ambient"
                ? "fal has no SFX-only flag — this enables full native audio; describe ambient sound and SFX in the shot prompt and avoid quoted dialogue."
                : "Full native audio — dialogue, SFX, and ambient in one pass."}
          </p>
          {seedanceAudioMode !== "off" ? (
            <>
              <p className="text-[10px] leading-relaxed text-muted">
                For spoken lines, put dialogue in double quotes in the shot description — Seedance
                will lip-sync it.
              </p>
              <p className="text-[10px] leading-relaxed text-muted">
                Native voices are model-generated and may vary between shots — for a consistent
                character voice across episodes, keep dialogue audio off here and use a dedicated
                voice pass.
              </p>
            </>
          ) : null}
        </div>

        <div>
          <FieldLabel>Clip length</FieldLabel>
          <select
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={selectClass}
          >
            {SEEDANCE_DURATION_OPTIONS.map((seconds) => (
              <option key={seconds} value={String(seconds)}>
                {seconds} seconds
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>Resolution</FieldLabel>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as "480p" | "720p")}
            className={selectClass}
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
          </select>
        </div>
      </div>

      <CreditCostHint
        cost={estimatedCost}
        available={availableCredits}
        isAdmin={userIsAdmin}
        label={`This ${duration}s ${resolution} shot`}
      />

      {insufficientCredits ? (
        <InsufficientCreditsWall
          needed={insufficientCredits.needed}
          available={insufficientCredits.available}
        />
      ) : null}

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={pending || !canGenerate}
        className="w-full"
      >
        {pending ? "Starting…" : "Generate video"}
      </Button>

      {startedMessage ? (
        <p className="text-center text-xs text-status-progress">{startedMessage}</p>
      ) : null}

      {!seedanceConfigured ? (
        <p className="text-center text-xs text-muted">Set FAL_KEY to enable Seedance 2.0.</p>
      ) : null}
    </div>
  );
}
