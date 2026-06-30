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
  SEEDANCE_AUDIO_MODE_SUMMARY,
  SEEDANCE_DURATION_OPTIONS,
  type GenerationQualityMode,
  type SeedanceAudioMode,
  normalizeSeedanceAudioMode,
  resolveQualitySettings,
} from "@/lib/ai/video/seedance-constants";
import {
  SHOT_INTENTS,
  SHOT_INTENT_LABELS,
  inferDefaultShotIntent,
  normalizeShotIntent,
  type ShotIntent,
} from "@/lib/production/prompts";
import type { ResolvedReference } from "@/lib/production/types";

const MAX_TAKES = 5;

interface GenerationPanelProps {
  sceneId: string;
  seriesId: string;
  episodeId: string;
  seedanceConfigured: boolean;
  scenePrompt?: string | null;
  shotIntent?: string | null;
  audioMode?: string | null;
  durationSeconds?: number | null;
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

function clampDuration(seconds: number | null | undefined): number {
  const fallback = 8;
  const value = typeof seconds === "number" && Number.isFinite(seconds) ? Math.round(seconds) : fallback;
  const clamped = Math.min(15, Math.max(4, value));
  return SEEDANCE_DURATION_OPTIONS.includes(clamped as (typeof SEEDANCE_DURATION_OPTIONS)[number])
    ? clamped
    : SEEDANCE_DURATION_OPTIONS.reduce((prev, curr) =>
        Math.abs(curr - clamped) < Math.abs(prev - clamped) ? curr : prev,
      );
}

function shotIntentSummary(intent: ShotIntent): string {
  const label = SHOT_INTENT_LABELS[intent];
  const short = label.split("(")[0]?.trim().toLowerCase() ?? intent.replace(/_/g, " ");
  return short;
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
  shotIntent: segmentShotIntent = null,
  audioMode: segmentAudioMode = null,
  durationSeconds: segmentDurationSeconds = null,
  resolvedReferences = [],
}: GenerationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [takeCount, setTakeCount] = useState(1);
  const [quality, setQuality] = useState<GenerationQualityMode>("final");
  const [duration, setDuration] = useState(() => clampDuration(segmentDurationSeconds));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shotIntentOverride, setShotIntentOverride] = useState<ShotIntent | null>(null);
  const [audioModeOverride, setAudioModeOverride] = useState<SeedanceAudioMode | null>(null);
  const [startedMessage, setStartedMessage] = useState<string | null>(null);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [insufficientCredits, setInsufficientCredits] = useState<{
    needed: number;
    available: number;
  } | null>(null);

  const resolvedShotIntent = useMemo(
    () =>
      shotIntentOverride ??
      normalizeShotIntent(segmentShotIntent) ??
      inferDefaultShotIntent(scenePrompt ?? ""),
    [shotIntentOverride, segmentShotIntent, scenePrompt],
  );

  const resolvedAudioMode = useMemo(
    () =>
      audioModeOverride ??
      normalizeSeedanceAudioMode(segmentAudioMode) ??
      ("ambient" as SeedanceAudioMode),
    [audioModeOverride, segmentAudioMode],
  );

  const qualitySettings = useMemo(() => resolveQualitySettings(quality), [quality]);

  const estimatedCostPerTake = useMemo(
    () =>
      estimateVideoCredits({
        tier: qualitySettings.tier,
        resolution: qualitySettings.resolution,
        durationSeconds: duration,
      }),
    [qualitySettings, duration],
  );

  const estimatedCost = estimatedCostPerTake * takeCount;

  const seedanceRefLabels = useMemo(
    () => seedanceReferenceLabels(resolvedReferences),
    [resolvedReferences],
  );
  const canGenerate = seedanceConfigured && seedanceRefLabels.length > 0;

  useEffect(() => {
    setDuration(clampDuration(segmentDurationSeconds));
    setShotIntentOverride(null);
    setAudioModeOverride(null);
    setShowAdvanced(false);
    setTakeCount(1);
  }, [sceneId, segmentDurationSeconds]);

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
        quality,
        durationSeconds: duration,
        takeCount,
        shotIntentOverride: showAdvanced ? shotIntentOverride ?? resolvedShotIntent : undefined,
        audioModeOverride: showAdvanced ? audioModeOverride ?? resolvedAudioMode : undefined,
      });

      if ("error" in result && result.error) {
        if (result.insufficientCredits) {
          setInsufficientCredits(result.insufficientCredits);
        } else {
          alert(result.error);
        }
      } else {
        const takeLabel = takeCount === 1 ? "take" : `${takeCount} takes`;
        setStartedMessage(
          `Generating ${takeLabel} from ${seedanceRefLabels.length} reference${seedanceRefLabels.length === 1 ? "" : "s"}… may take several minutes`,
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
          Seedance generates video from bound references and your shot prompt. Shot intent and audio
          are set by the co-pilot — adjust takes, quality, and duration below.
        </p>
      </div>

      <div className="rounded-md border border-border/60 bg-background/30 px-3 py-2.5">
        <p className="studio-section-label">Model</p>
        <p className="mt-1 text-sm text-foreground">Seedance 2.0</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {seedanceRefLabels.length
            ? `References: ${seedanceRefLabels.join(", ")}`
            : "Bind a character sheet or location — mention them in the prompt to auto-bind."}
        </p>
        <p className="mt-2 text-xs text-muted">
          Shot: {shotIntentSummary(resolvedShotIntent)} · Audio:{" "}
          {SEEDANCE_AUDIO_MODE_SUMMARY[resolvedAudioMode]}
        </p>
      </div>

      <div className="space-y-4 rounded-md border border-border/60 bg-background/30 p-3">
        <div>
          <FieldLabel hint="How many variations to generate this run.">Number of takes</FieldLabel>
          <input
            type="number"
            min={1}
            max={MAX_TAKES}
            value={takeCount}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              setTakeCount(Math.min(MAX_TAKES, Math.max(1, Math.round(next))));
            }}
            className={selectClass}
          />
        </div>

        <div>
          <FieldLabel hint="Draft is faster and cheaper; Final is higher quality.">
            Quality
          </FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {(["draft", "final"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setQuality(mode)}
                className={`rounded-md border px-3 py-2 text-sm capitalize transition-colors ${
                  quality === mode
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border bg-background text-muted hover:text-foreground"
                }`}
              >
                {mode}
                <span className="mt-0.5 block text-[10px] normal-case text-muted">
                  {mode === "draft" ? "480p · Fast" : "720p · Standard"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel hint="Pre-filled from the co-pilot; adjust if needed.">Duration</FieldLabel>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40"
              disabled={duration <= SEEDANCE_DURATION_OPTIONS[0]}
              onClick={() => {
                const idx = SEEDANCE_DURATION_OPTIONS.indexOf(
                  duration as (typeof SEEDANCE_DURATION_OPTIONS)[number],
                );
                if (idx > 0) setDuration(SEEDANCE_DURATION_OPTIONS[idx - 1]);
              }}
            >
              −
            </button>
            <span className="min-w-[4.5rem] text-center text-sm tabular-nums">{duration}s</span>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40"
              disabled={
                duration >= SEEDANCE_DURATION_OPTIONS[SEEDANCE_DURATION_OPTIONS.length - 1]
              }
              onClick={() => {
                const idx = SEEDANCE_DURATION_OPTIONS.indexOf(
                  duration as (typeof SEEDANCE_DURATION_OPTIONS)[number],
                );
                if (idx >= 0 && idx < SEEDANCE_DURATION_OPTIONS.length - 1) {
                  setDuration(SEEDANCE_DURATION_OPTIONS[idx + 1]);
                }
              }}
            >
              +
            </button>
          </div>
        </div>

        <details
          className="rounded-md border border-border/40 bg-background/20 p-3"
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-xs text-muted">Advanced overrides</summary>
          <div className="mt-3 space-y-3">
            <div>
              <FieldLabel>Shot intent</FieldLabel>
              <select
                value={shotIntentOverride ?? resolvedShotIntent}
                onChange={(e) => setShotIntentOverride(e.target.value as ShotIntent)}
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
              <FieldLabel>Audio mode</FieldLabel>
              <select
                value={audioModeOverride ?? resolvedAudioMode}
                onChange={(e) => setAudioModeOverride(e.target.value as SeedanceAudioMode)}
                className={selectClass}
              >
                {SEEDANCE_AUDIO_MODE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </div>

      <CreditCostHint
        cost={estimatedCost}
        available={availableCredits}
        isAdmin={userIsAdmin}
        label={
          takeCount > 1
            ? `${takeCount}× ${duration}s ${qualitySettings.resolution} shots`
            : `This ${duration}s ${qualitySettings.resolution} shot`
        }
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
        {pending ? "Starting…" : takeCount > 1 ? `Generate ${takeCount} takes` : "Generate video"}
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
